#!/usr/bin/env node
// Claude Code hook — enforces dual-mode (local lomod + remote lomod) awareness.
// Invoked as: node scripts/hooks/dual-mode-check.js <pre|post>
// Reads hook JSON from stdin, emits warnings to stderr, always exits 0 (non-blocking).

const fs = require('fs');
const path = require('path');

const mode = process.argv[2];
if (mode !== 'pre' && mode !== 'post') {
  process.exit(0);
}

let raw = '';
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  try {
    run(raw);
  } catch {
    // Hook failures must never block Claude.
  }
  process.exit(0);
});

function run(raw) {
  if (!raw.trim()) return;

  let event;
  try { event = JSON.parse(raw); } catch { return; }

  const toolName = event.tool_name || '';
  if (!/^(Edit|Write|MultiEdit)$/.test(toolName)) return;

  const filePath = event.tool_input && event.tool_input.file_path;
  if (!filePath || typeof filePath !== 'string') return;

  const posixPath = filePath.replace(/\\/g, '/').toLowerCase();
  const inProxy = posixPath.includes('/proxy/');
  const inTauri = posixPath.includes('/src-tauri/');
  const inImmichWeb = posixPath.includes('/submodules/immich/web/');

  if (!inProxy && !inTauri && !inImmichWeb) return;

  if (mode === 'pre') {
    if (inProxy || inTauri) {
      emitPreReminder();
    }
    return;
  }

  // post mode — scan the written file
  scanFile(filePath, posixPath, { inProxy, inTauri, inImmichWeb });
}

function emitPreReminder() {
  const lines = [
    '',
    'DUAL-MODE CHECK (pre-edit) — this file is part of proxy/Tauri.',
    '  - Use session.serverUrl from getLomoToken(); never hardcode localhost.',
    '  - Proxy routes must fetch over HTTP, never read user photos from disk.',
    '  - Tauri IPC (pick_folder, save_app_settings, process mgmt) is local-only; guard for remote/web.',
    '  - Mentally trace BOTH code paths: local (Tauri + lomod) and remote (user URL).',
    '',
  ];
  process.stderr.write(lines.join('\n'));
}

function scanFile(filePath, posixPath, ctx) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }

  const warnings = [];

  // 1. Hardcoded localhost:8000 outside session.ts (which holds the documented DEFAULT_LOMO_URL fallback).
  if (!posixPath.endsWith('/proxy/session.ts')) {
    const lines = content.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (/https?:\/\/localhost:8000/.test(line)) {
        warnings.push(`line ${i + 1}: hardcoded http://localhost:8000 — use session.serverUrl from getLomoToken()`);
      }
    });
  }

  // 2. Proxy routes reading user files from local disk.
  if (posixPath.includes('/proxy/routes/')) {
    const lines = content.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (/\bfs\.(readFile|readFileSync|createReadStream)\s*\(/.test(line)) {
        // Allow reads that target proxy-owned resources by name.
        const allowed = /(WEB_DIR|sharp|web\.zip|CONFIG_PATH|config\.json)/.test(line);
        if (!allowed) {
          warnings.push(`line ${i + 1}: proxy route reads from local disk — fetch over HTTP from serverUrl instead`);
        }
      }
    });
  }

  // 3. Ungated Tauri IPC calls in the Immich web submodule.
  if (ctx.inImmichWeb) {
    const tauriCmds = /(pick_folder|save_app_settings|complete_initial_setup|save_backend_preference|get_app_settings|get_initial_setup_state)/;
    const lines = content.split(/\r?\n/);
    lines.forEach((line, i) => {
      const m = line.match(new RegExp(`invoke\\(['"\`](${tauriCmds.source.slice(1, -1)})['"\`]`));
      if (!m) return;
      // Look backwards up to 30 lines for a Tauri availability guard.
      const start = Math.max(0, i - 30);
      const window = lines.slice(start, i).join('\n');
      const guarded = /(__TAURI__|__TAURI_INTERNALS__|hasTauri|getTauriInvoke|isDesktop)/.test(window);
      if (!guarded) {
        warnings.push(`line ${i + 1}: Tauri IPC '${m[1]}' call has no nearby __TAURI__/hasTauri guard — will throw in web/remote-only contexts`);
      }
    });
  }

  // 4. Notice on DEFAULT_LOMO_URL changes.
  if (posixPath.endsWith('/proxy/session.ts') && /DEFAULT_LOMO_URL/.test(content)) {
    // Only note the reminder if the edit actually touched the symbol definition.
    if (/const\s+DEFAULT_LOMO_URL\s*=/.test(content)) {
      // Soft informational note — no location needed.
      warnings.push('DEFAULT_LOMO_URL is only the bootstrap fallback for session creation — it must not become the runtime default');
    }
  }

  if (warnings.length === 0) return;

  const header = `\nDUAL-MODE CHECK (post-edit) — ${path.basename(filePath)}:`;
  process.stderr.write(header + '\n');
  for (const w of warnings) {
    process.stderr.write('  - ' + w + '\n');
  }
  process.stderr.write('\n');
}
