// First-start account setup for the Docker image. The desktop app creates the first lomod
// account from its setup screen (a Tauri command); in the container there is no such screen,
// so the entrypoint runs this once lomod is up.
//
// - LOMO_ADMIN_USER (default admin) / LOMO_ADMIN_PASSWORD. With no password set, a random one
//   is generated, printed to the container log and saved to <data>/admin-password.txt.
// - The account's photos live under <photos>/<user>, like the desktop app's <photos dir>/admin.
// - Runs once: <data>/.admin-initialized records that setup is done. If lomod already has an
//   account (an existing data volume), lomod refuses a new one without a token (401); that is
//   reported and treated as done.

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLomodUser } from '../scripts/lib/lomo-credential.mjs';

const dataDir = process.env.LOMO_DATA_DIR || '/data';
const photosDir = process.env.LOMO_PHOTOS_DIR || '/photos';
const lomodUrl = `http://127.0.0.1:${process.env.LOMOD_PORT || 8000}`;
const marker = join(dataDir, '.admin-initialized');

if (existsSync(marker)) process.exit(0);

const username = (process.env.LOMO_ADMIN_USER || 'admin').trim();
let password = process.env.LOMO_ADMIN_PASSWORD || '';
const generated = !password;
if (generated) password = randomBytes(9).toString('base64url');

const homeDir = join(photosDir, username);
mkdirSync(homeDir, { recursive: true });

const res = await createLomodUser(lomodUrl, { username, password, homeDir });
if (res.ok) {
  if (generated) {
    writeFileSync(join(dataDir, 'admin-password.txt'), `${username}\n${password}\n`, { mode: 0o600 });
  }
  writeFileSync(marker, `${JSON.stringify({ username, created: new Date().toISOString() })}\n`);
  const lines = [
    'Created the first account:',
    `  user:     ${username}`,
    `  password: ${password}`,
    generated
      ? `  (generated; also saved to ${join(dataDir, 'admin-password.txt')})`
      : '  (from LOMO_ADMIN_PASSWORD)',
  ];
  console.log(`\n${lines.map((l) => `[lomo] ${l}`).join('\n')}\n`);
} else if (res.status === 401) {
  writeFileSync(marker, `${JSON.stringify({ username: null, existing: true })}\n`);
  console.log('[lomo] lomod already has an account (existing data); sign in with its password.');
} else {
  console.error(`[lomo] creating the first account failed: HTTP ${res.status} ${await res.text()}`);
  process.exit(1);
}
