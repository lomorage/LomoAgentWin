// First-start account setup for the Docker image, when the password is given up front.
//
// Normally the first account is set up in the browser: until lomod has one, the web app
// redirects to /lomo-setup, where the user picks the password of LOMO_ADMIN_USER (default
// admin) -- see proxy/web-setup.ts. Setting LOMO_ADMIN_PASSWORD instead creates the account
// here, on first start, for unattended installs.
//
// - The account's photos live under <photos>/<user>, like the desktop app's <photos dir>/admin.
// - Runs once: <data>/.admin-initialized records that setup is done. If lomod already has an
//   account (an existing data volume, or set up in the browser), lomod refuses a new one
//   without a token (401); that is treated as done.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLomodUser } from '../scripts/lib/lomo-credential.mjs';

const dataDir = process.env.LOMO_DATA_DIR || '/data';
const photosDir = process.env.LOMO_PHOTOS_DIR || '/photos';
const lomodUrl = `http://127.0.0.1:${process.env.LOMOD_PORT || 8000}`;
const marker = join(dataDir, '.admin-initialized');
const username = (process.env.LOMO_ADMIN_USER || 'admin').trim();
const password = process.env.LOMO_ADMIN_PASSWORD || '';

if (existsSync(marker) || !password) process.exit(0);

const homeDir = join(photosDir, username);
mkdirSync(homeDir, { recursive: true });

const res = await createLomodUser(lomodUrl, { username, password, homeDir });
if (res.ok) {
  writeFileSync(marker, `${JSON.stringify({ username, created: new Date().toISOString() })}\n`);
  console.log(`[lomo] Created the first account "${username}" with the password from LOMO_ADMIN_PASSWORD`);
} else if (res.status === 401) {
  writeFileSync(marker, `${JSON.stringify({ username: null, existing: true })}\n`);
  console.log('[lomo] lomod already has an account; sign in with its password.');
} else {
  console.error(`[lomo] creating the first account failed: HTTP ${res.status} ${await res.text()}`);
  process.exit(1);
}
