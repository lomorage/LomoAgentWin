/**
 * Lomorage welcome wizard — served at GET /lomo-welcome
 *
 * 4-slide intro: hero → what is Lomorage → two host modes → get started.
 * finish() navigates to '/' (works in both Tauri WebView and plain browser).
 *
 * Fonts: Space Grotesk + Instrument Serif loaded from Google Fonts.
 * Served over HTTP, so the HTTPS font requests have no CORS restriction.
 */
export const WELCOME_HTML = /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Welcome to Lomorage</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg-page: #efecf6;
    --border-soft: #e6e2f2;
    --border-strong: #d6cff0;
    --ink-900: #1e1a3a;
    --ink-700: #3a3565;
    --ink-500: #6b6590;
    --ink-400: #8d86ad;
    --brand: #5146c7;
    --brand-ink: #4035b5;
    --brand-soft: #ebe7fb;
    --brand-tint: #f3f0fd;
    --radius-md: 10px;
    --radius-pill: 999px;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Space Grotesk", "Helvetica Neue", Helvetica, Arial, sans-serif;
    background:
      radial-gradient(ellipse at 20% 10%, rgba(81,70,199,0.06), transparent 50%),
      radial-gradient(ellipse at 90% 90%, rgba(81,70,199,0.04), transparent 40%),
      var(--bg-page);
    color: var(--ink-900);
    position: fixed; inset: 0;
    display: flex; flex-direction: column;
    -webkit-font-smoothing: antialiased;
    font-feature-settings: "ss01", "ss02";
    overflow: hidden;
  }

  /* ── Stage ── */
  .stage {
    flex: 1; min-height: 0;
    display: flex; align-items: stretch;
    overflow: hidden;
  }

  /* ── Slides ── */
  .slide { flex: 1; display: none; flex-direction: row; align-items: stretch; animation: fadeIn 0.35s ease; }
  .slide.active { display: flex; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

  .slide-left {
    flex: 1.05; padding: 40px 56px 28px;
    display: flex; flex-direction: column; justify-content: flex-start;
    min-width: 0; overflow-y: auto;
  }
  .slide-right {
    flex: 1; padding: 32px 56px 32px 0;
    display: flex; align-items: center; justify-content: center; min-width: 0;
  }
  .slide.centered .slide-left {
    flex: 1; align-items: center; text-align: center;
    padding: 40px 64px; justify-content: center; overflow-y: auto;
  }
  .slide.centered .slide-right { display: none; }

  /* ── Typography ── */
  .eyebrow { font-size: 12px; letter-spacing: .22em; color: var(--brand); font-weight: 600; margin-bottom: 10px; text-transform: uppercase; }
  .headline { font-size: 34px; font-weight: 600; color: var(--ink-900); line-height: 1.15; letter-spacing: -.02em; margin: 0 0 14px; text-wrap: balance; }
  .headline .em { color: var(--brand); }
  .lede { font-size: 16px; line-height: 1.55; color: var(--ink-700); margin: 0 0 18px; max-width: 520px; text-wrap: pretty; }

  /* ── Hero mark ── */
  .hero-mark { width: 80px; height: 80px; border-radius: 50%; border: 3px solid var(--brand); position: relative; margin: 0 auto 22px; }
  .hero-mark::after { content: ""; position: absolute; inset: 13px; border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #fff 0%, #fff 18%, transparent 20%), var(--brand); }
  .hero-name { font-family: "Instrument Serif", Georgia, serif; font-weight: 400; font-style: italic; font-size: 88px; color: var(--brand); letter-spacing: -.02em; line-height: 1; margin: 0 0 6px; }
  .hero-tag { font-size: 13px; letter-spacing: .3em; color: var(--brand); opacity: .7; font-weight: 500; margin-bottom: 24px; }
  .hero-sub { font-size: 17px; color: var(--ink-700); line-height: 1.6; max-width: 520px; margin: 0 auto; text-wrap: pretty; }

  /* ── Feature list ── */
  .features { display: grid; gap: 12px; margin: 0 0 8px; }
  .feature { display: flex; gap: 14px; align-items: flex-start; }
  .feature-bullet { width: 28px; height: 28px; border-radius: 50%; background: var(--brand-soft); color: var(--brand); display: grid; place-items: center; flex-shrink: 0; font-weight: 600; font-size: 13px; }
  .feature-text { font-size: 14.5px; color: var(--ink-700); line-height: 1.55; }
  .feature-text b { color: var(--ink-900); font-weight: 600; }

  /* ── Photo collage ── */
  .visual { width: 100%; height: 100%; max-width: 420px; max-height: 440px; position: relative; }
  .photos { position: relative; width: 100%; height: 100%; }
  .ph { position: absolute; border-radius: 12px; background-size: cover; background-position: center;
        box-shadow: 0 12px 32px rgba(30,26,58,.18); overflow: hidden; }
  .ph::after { content: ""; position: absolute; inset: 0;
               background: linear-gradient(180deg, transparent 60%, rgba(0,0,0,.18)); border-radius: inherit; }
  .ph.p1 { width:56%; height:50%; left:6%;  top:8%;  transform:rotate(-4deg); background:linear-gradient(135deg,#e07a5f,#b85a3e); }
  .ph.p2 { width:50%; height:44%; right:4%; top:4%;  transform:rotate(5deg);  background:linear-gradient(135deg,#2a9d8f,#1f7a70); }
  .ph.p3 { width:48%; height:42%; left:14%; bottom:4%; transform:rotate(3deg); background:linear-gradient(135deg,#e0a93a,#b8862a); }
  .ph.p4 { width:44%; height:40%; right:6%; bottom:8%; transform:rotate(-6deg); background:linear-gradient(135deg,#5146c7,#3a31a3); }
  .ph-label { position:absolute; bottom:10px; left:12px; color:rgba(255,255,255,.95); font-size:11px; font-weight:500; z-index:1; text-shadow:0 1px 2px rgba(0,0,0,.3); letter-spacing:.05em; }

  /* ── Mode cards ── */
  .modes { display: grid; gap: 14px; width: 100%; max-width: 440px; }
  .mode { background: #fff; border: 1.5px solid var(--border-soft); border-radius: var(--radius-md); padding: 18px 18px 16px; position: relative; }
  .mode-head { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
  .mode-icon { width:42px; height:42px; border-radius:10px; background:var(--brand-soft); color:var(--brand); display:grid; place-items:center; flex-shrink:0; }
  .mode-icon svg { width:22px; height:22px; }
  .mode-title { font-size:17px; font-weight:600; color:var(--ink-900); }
  .mode-sub { font-size:12.5px; color:var(--ink-500); margin-top:2px; }
  .mode-desc { font-size:13.5px; color:var(--ink-700); line-height:1.55; }
  .mode-tag { position:absolute; top:14px; right:14px; font-size:10px; letter-spacing:.15em; text-transform:uppercase; color:var(--brand); background:var(--brand-tint); padding:3px 8px; border-radius:999px; font-weight:600; }

  /* ── Viewer mock ── */
  .viewer-mock { width:100%; max-width:420px; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 12px 36px rgba(30,26,58,.14); border:1px solid var(--border-soft); }
  .vm-bar { height:26px; background:#f4f2f9; border-bottom:1px solid var(--border-soft); display:flex; align-items:center; padding:0 10px; gap:12px; }
  .vm-search { flex:1; height:18px; background:#fff; border-radius:9px; border:1px solid var(--border-soft); font-size:10px; color:var(--ink-400); padding:0 10px; display:flex; align-items:center; }
  .vm-body { padding:14px; }
  .vm-date { font-size:11px; color:var(--ink-500); margin-bottom:8px; font-weight:500; letter-spacing:.05em; }
  .vm-date b { color:var(--ink-900); font-weight:600; font-size:13px; letter-spacing:0; }
  .vm-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:3px; margin-bottom:12px; }
  .vm-cell { aspect-ratio:1; border-radius:3px; }
  .vm-grid.s2 { grid-template-columns:repeat(5,1fr); gap:2px; }
  .vm-grid.s2 .vm-cell { border-radius:2px; }

  /* ── Compact feature cards ── */
  .compact-features { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:4px; }
  .cf { background:#fff; border:1px solid var(--border-soft); border-radius:10px; padding:14px 16px; }
  .cf-icon { width:24px; height:24px; color:var(--brand); margin-bottom:8px; }
  .cf-title { font-size:15px; font-weight:600; color:var(--ink-900); margin-bottom:4px; }
  .cf-desc  { font-size:13px; color:var(--ink-500); line-height:1.45; }

  /* ── Slide 4 right column ── */
  .slide-right.slide4-right { flex-direction:column; gap:14px; justify-content:center; }
  .viewer-mock-sm { transform:scale(.92); transform-origin:center top; }
  .slide4-cta-stack { display:flex; justify-content:center; margin-top:4px; }
  .slide4-cta-stack .btn { min-width:200px; }

  /* ── Artistic typography ── */
  .slide.artistic .eyebrow { font-family:"Instrument Serif",Georgia,serif; font-style:italic; text-transform:none; letter-spacing:0; font-size:20px; font-weight:400; color:var(--brand); opacity:.85; margin-bottom:4px; }
  .slide.artistic .headline { font-family:"Instrument Serif",Georgia,serif; font-weight:400; font-size:48px; line-height:1.05; letter-spacing:-.02em; color:var(--ink-900); margin:0 0 16px; }
  .slide.artistic .headline .em { font-style:italic; color:var(--brand); font-weight:400; }
  .slide.artistic .lede { font-size:17px; line-height:1.6; color:var(--ink-700); max-width:520px; }
  .slide.artistic .feature-text b { font-family:"Instrument Serif",Georgia,serif; font-style:italic; font-weight:500; font-size:18px; color:var(--brand); letter-spacing:.005em; margin-right:3px; }
  .slide.artistic .mode-title { font-family:"Instrument Serif",Georgia,serif; font-style:italic; font-weight:400; font-size:24px; color:var(--brand); }

  /* ── Button ── */
  .btn { height:46px; padding:0 26px; border:none; border-radius:var(--radius-pill); background:var(--brand); color:#fff; font-size:14px; font-weight:600; font-family:inherit; cursor:pointer; transition:all .15s ease; display:inline-flex; align-items:center; justify-content:center; gap:8px; }
  .btn:hover  { background:var(--brand-ink); }
  .btn:active { transform:translateY(1px); }
  .btn.secondary { background:transparent; color:var(--ink-700); border:1.5px solid var(--border-strong); }
  .btn.secondary:hover { background:var(--brand-tint); color:var(--brand); border-color:var(--brand); }
  .btn.ghost { background:transparent; color:var(--ink-500); padding:0 12px; }
  .btn.ghost:hover { color:var(--brand); }

  /* ── Footer ── */
  .stage-footer { flex-shrink:0; height:60px; background:#fff; border-top:1px solid var(--border-soft); display:flex; align-items:center; padding:0 24px; gap:16px; }
  .progress { display:flex; gap:6px; align-items:center; }
  .progress-dot { width:28px; height:5px; border-radius:3px; background:var(--border-strong); transition:all .3s ease; border:none; padding:0; cursor:pointer; }
  .progress-dot.active { background:var(--brand); width:40px; }
  .progress-dot.done   { background:var(--brand); opacity:.45; }
  .progress-dot:hover:not(.active) { background:var(--brand); opacity:.7; }
  .step-counter { font-size:13px; color:var(--ink-500); font-variant-numeric:tabular-nums; margin-left:6px; }
  .step-counter b { color:var(--ink-900); font-weight:600; }
  .footer-spacer { flex:1; }

  /* ── Don't show again ── */
  .dsa { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--ink-500); cursor:pointer; user-select:none; }
  .dsa input { display:none; }
  .dsa .box { width:16px; height:16px; border-radius:4px; border:1.5px solid var(--border-strong); background:#fff; display:grid; place-items:center; transition:all .15s; }
  .dsa input:checked + .box { background:var(--brand); border-color:var(--brand); }
  .dsa input:checked + .box::after { content:""; width:4px; height:7px; border:solid #fff; border-width:0 1.5px 1.5px 0; transform:rotate(45deg) translate(-.5px,-.5px); }

  @media (max-width: 860px) {
    .slide { flex-direction: column; }
    .slide-left, .slide-right { padding: 28px 32px; flex: none; }
    .slide-right { padding-top: 0; }
  }
</style>
</head>
<body>
  <div class="stage">

    <!-- Slide 1: Welcome -->
    <div class="slide artistic centered active" data-slide="0">
      <div class="slide-left">
        <div class="hero-mark"></div>
        <div class="hero-name">Lomorage</div>
        <div class="hero-tag">SELF&#8209;HOST&nbsp;&nbsp;·&nbsp;&nbsp;BACKUP&nbsp;&nbsp;·&nbsp;&nbsp;MANAGE</div>
        <p class="hero-sub">
          A one-minute tour of what Lomorage does — and how to
          back up, browse, and manage your photos on hardware you own.
        </p>
      </div>
    </div>

    <!-- Slide 2: What is Lomorage -->
    <div class="slide artistic" data-slide="1">
      <div class="slide-left">
        <div class="eyebrow">What is Lomorage</div>
        <h1 class="headline">Your photo library,<br>on hardware <span class="em">you own</span>.</h1>
        <p class="lede">
          An open-source photo backup stack — originals stay on hardware
          you own. Never uploaded, never tracked, never used to train models.
        </p>
        <div class="features">
          <div class="feature">
            <div class="feature-bullet">1</div>
            <div class="feature-text"><b>Self-hosted backup</b>&nbsp; Photos stay on hardware you own — no cloud uploads, no tracking.</div>
          </div>
          <div class="feature">
            <div class="feature-bullet">2</div>
            <div class="feature-text"><b>Browsed by time</b>&nbsp; Auto-organized by year, month, and day.</div>
          </div>
          <div class="feature">
            <div class="feature-bullet">3</div>
            <div class="feature-text"><b>Open &amp; portable</b>&nbsp; MIT-licensed, plain files on disk. Take everything anywhere.</div>
          </div>
        </div>
      </div>
      <div class="slide-right">
        <div class="visual">
          <div class="photos">
            <div class="ph p1"><div class="ph-label">2024 · COAST</div></div>
            <div class="ph p2"><div class="ph-label">2023 · TRAVEL</div></div>
            <div class="ph p3"><div class="ph-label">2022 · WEDDING</div></div>
            <div class="ph p4"><div class="ph-label">2025 · HOME</div></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Slide 3: Two ways to host -->
    <div class="slide artistic" data-slide="2">
      <div class="slide-left">
        <div class="eyebrow">Two ways to host</div>
        <h1 class="headline">Store on <span class="em">this machine</span>,<br>or on a <span class="em">remote server</span>.</h1>
        <p class="lede">
          On first launch, Lomorage asks where your library should live.
          Both modes share the same browsing UI — only the storage location differs.
        </p>
        <div class="features">
          <div class="feature">
            <div class="feature-bullet">A</div>
            <div class="feature-text"><b>This machine</b>&nbsp; Lomorage ships with a lightweight backend <code style="font-family:'JetBrains Mono',monospace;font-size:12px;background:var(--brand-soft);color:var(--brand);padding:1px 5px;border-radius:3px;">lomod</code>. Set a password and you're done.</div>
          </div>
          <div class="feature">
            <div class="feature-bullet">B</div>
            <div class="feature-text"><b>Remote server</b>&nbsp; Enter the host, port, and credentials to sign in to a Lomorage backend you already run.</div>
          </div>
        </div>
      </div>
      <div class="slide-right">
        <div class="modes">
          <div class="mode">
            <div class="mode-tag">A</div>
            <div class="mode-head">
              <div class="mode-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="4" width="20" height="14" rx="2"/>
                  <line x1="8" y1="22" x2="16" y2="22"/>
                  <line x1="12" y1="18" x2="12" y2="22"/>
                </svg>
              </div>
              <div>
                <div class="mode-title">This machine</div>
                <div class="mode-sub">Built-in backend · localhost:8000</div>
              </div>
            </div>
            <div class="mode-desc">Photos live on your local disk. Best for a single computer, or for trying Lomorage out.</div>
          </div>
          <div class="mode">
            <div class="mode-tag">B</div>
            <div class="mode-head">
              <div class="mode-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="3" width="20" height="8" rx="1"/>
                  <rect x="2" y="13" width="20" height="8" rx="1"/>
                  <line x1="6" y1="7" x2="6.01" y2="7"/>
                  <line x1="6" y1="17" x2="6.01" y2="17"/>
                </svg>
              </div>
              <div>
                <div class="mode-title">Remote server</div>
                <div class="mode-sub">Home NAS · self-hosted box</div>
              </div>
            </div>
            <div class="mode-desc">One library, shared across devices. Best for families, teams, or any setup you already run.</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Slide 4: Ready when you are -->
    <div class="slide artistic" data-slide="3">
      <div class="slide-left">
        <div class="eyebrow">Ready when you are</div>
        <h1 class="headline">Browse by <span class="em">time</span>.<br>Set up in seconds.</h1>
        <div class="compact-features">
          <div class="cf">
            <svg class="cf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <div class="cf-title">Browse timeline</div>
            <div class="cf-desc">Drag the side scrubber to jump to any month.</div>
          </div>
          <div class="cf">
            <svg class="cf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <div class="cf-title">Full-screen view</div>
            <div class="cf-desc">Click a thumbnail, then ← → to flip through.</div>
          </div>
          <div class="cf">
            <svg class="cf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="7"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <div class="cf-title">Search</div>
            <div class="cf-desc">Filter by date or filename in one keystroke.</div>
          </div>
          <div class="cf">
            <svg class="cf-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <div class="cf-title">Import</div>
            <div class="cf-desc">Drop a folder onto the window to back it up.</div>
          </div>
        </div>
      </div>
      <div class="slide-right slide4-right">
        <div class="viewer-mock viewer-mock-sm" id="viewerMock">
          <div class="vm-bar">
            <div style="display:flex;gap:5px;">
              <div style="width:8px;height:8px;border-radius:50%;background:#ff736a;"></div>
              <div style="width:8px;height:8px;border-radius:50%;background:#febc2e;"></div>
              <div style="width:8px;height:8px;border-radius:50%;background:#19c332;"></div>
            </div>
            <div class="vm-search">Search photos…</div>
          </div>
          <div class="vm-body">
            <div class="vm-date"><b>August 2024</b> · Fri, 16</div>
            <div class="vm-grid" id="grid1"></div>
            <div class="vm-date"><b>August 2024</b> · Mon, 12</div>
            <div class="vm-grid s2" id="grid2"></div>
          </div>
        </div>
        <div class="slide4-cta-stack">
          <button class="btn" onclick="finish()">
            Get started
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M4 2 L10 7 L4 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

  </div><!-- /stage -->

  <div class="stage-footer">
    <label class="dsa">
      <input type="checkbox" id="dsa">
      <span class="box"></span>
      <span>Don't show again</span>
    </label>
    <div class="footer-spacer"></div>
    <div class="progress" id="progress"></div>
    <div class="step-counter"><b id="curStep">1</b> / <span id="totalSteps">4</span></div>
    <div class="footer-spacer"></div>
    <button class="btn ghost"     id="skipBtn" onclick="finish()">Skip</button>
    <button class="btn secondary" id="prevBtn" onclick="go(-1)">Back</button>
    <button class="btn"           id="nextBtn" onclick="go(1)">
      Next
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M4 2 L10 7 L4 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>
    </button>
  </div>

<script>
  (function buildViewer() {
    const palette = [
      'linear-gradient(135deg,#e07a5f,#b85a3e)',
      'linear-gradient(135deg,#2a9d8f,#1f7a70)',
      'linear-gradient(135deg,#e0a93a,#b8862a)',
      'linear-gradient(135deg,#5146c7,#3a31a3)',
      'linear-gradient(135deg,#d4a4a4,#a87878)',
      'linear-gradient(135deg,#7fb069,#5a8a4a)',
      'linear-gradient(135deg,#f4a261,#d68440)',
      'linear-gradient(135deg,#5b8db8,#3e6a90)',
    ];
    const make = (id, count) => {
      const el = document.getElementById(id);
      if (!el) return;
      for (let i = 0; i < count; i++) {
        const d = document.createElement('div');
        d.className = 'vm-cell';
        d.style.background = palette[(i + id.charCodeAt(4)) % palette.length];
        el.appendChild(d);
      }
    };
    make('grid1', 8);
    make('grid2', 10);
  })();

  const slides = document.querySelectorAll('.slide');
  const TOTAL  = slides.length;
  let cur = 0;
  document.getElementById('totalSteps').textContent = TOTAL;

  const progress = document.getElementById('progress');
  for (let i = 0; i < TOTAL; i++) {
    const b = document.createElement('button');
    b.className = 'progress-dot';
    b.setAttribute('aria-label', 'Step ' + (i + 1));
    b.onclick = () => jumpTo(i);
    progress.appendChild(b);
  }

  function render() {
    slides.forEach((s, i) => s.classList.toggle('active', i === cur));
    const dots = progress.children;
    for (let i = 0; i < dots.length; i++) {
      dots[i].classList.toggle('active', i === cur);
      dots[i].classList.toggle('done',   i < cur);
    }
    document.getElementById('curStep').textContent = cur + 1;
    const prev = document.getElementById('prevBtn');
    const next = document.getElementById('nextBtn');
    const skip = document.getElementById('skipBtn');
    prev.style.visibility = cur === 0 ? 'hidden' : 'visible';
    if (cur === TOTAL - 1) {
      next.innerHTML = 'Get started <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 2 L10 7 L4 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
      next.onclick = finish;
      skip.style.display = 'none';
    } else {
      next.innerHTML = 'Next <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 2 L10 7 L4 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
      next.onclick = () => go(1);
      skip.style.display = '';
    }
    try { localStorage.setItem('lomo_welcome_step', String(cur)); } catch(e) {}
  }

  function go(delta) { const n = cur + delta; if (n >= 0 && n < TOTAL) { cur = n; render(); } }
  function jumpTo(i) { cur = i; render(); }

  function finish() {
    const dsa = document.getElementById('dsa').checked;
    try {
      if (dsa) localStorage.setItem('lomo_welcome_dismissed', '1');
      localStorage.removeItem('lomo_welcome_step');
    } catch(e) {}
    window.location.href = '/';
  }

  try {
    const saved = parseInt(localStorage.getItem('lomo_welcome_step') || '0', 10);
    if (!isNaN(saved) && saved >= 0 && saved < TOTAL) cur = saved;
  } catch(e) {}

  window.addEventListener('keydown', (e) => {
    if      (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft')  go(-1);
    else if (e.key === 'Escape')     finish();
  });

  render();
</script>
</body>
</html>`;
