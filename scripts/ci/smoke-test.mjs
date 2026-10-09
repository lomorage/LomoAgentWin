// Smoke test for a running LomoAgent: lomod + proxy, as started by the installed app (CI) or by
// hand. Walks the first thing a new user does: the web UI loads, an account is created, the
// user signs in, uploads a photo, sees it in the timeline and gets its thumbnail back.
//
// That covers the parts most likely to break in a packaged build: lomod.exe and its bundled
// DLLs (libvips makes the thumbnail), the proxy's pkg'd Node runtime, the extracted web.zip,
// and the proxy <-> lomod API translation (login, upload, timeline, thumbnail).
//
// Usage: node scripts/ci/smoke-test.mjs
//   PROXY_URL      default http://127.0.0.1:3001
//   LOMOD_URL      default http://127.0.0.1:8000
//   ADMIN_HOME     create the admin account first, with this directory as its photo home
//                  (created if missing). Like the desktop app's setup (complete_initial_setup)
//                  it should be <photos dir>/admin. Leave unset when the account already exists
//                  (the Docker image creates it on first start) and pass SMOKE_PASSWORD instead.
//   SMOKE_USER     account to sign in as, default admin
//   SMOKE_PASSWORD its password; default smoke-test-password (the one ADMIN_HOME mode creates)
//   SMOKE_TIMEOUT  seconds to wait for lomod and the proxy to come up, default 120
//
// Needs Node 20+ (global fetch/FormData) and proxy/node_modules installed (for hash-wasm).
// Run by .github/workflows/build-windows.yml against the freshly installed desktop app, and by
// .github/workflows/docker.yml against the Docker image.

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLomodUser } from '../lib/lomo-credential.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const PROXY_URL = (process.env.PROXY_URL || 'http://127.0.0.1:3001').replace(/\/$/, '');
const LOMOD_URL = (process.env.LOMOD_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const ADMIN_HOME = process.env.ADMIN_HOME;
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT || 120) * 1000;
const USERNAME = process.env.SMOKE_USER || 'admin';
const PASSWORD = process.env.SMOKE_PASSWORD || 'smoke-test-password';
const PHOTO = join(here, 'fixtures', 'smoke.jpg'); // 320x240 JPEG, EXIF date 2024-05-17

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message) {
  throw new Error(message);
}

function ok(message) {
  console.log(`ok: ${message}`);
}

async function waitFor(name, url) {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return;
      lastError = `HTTP ${res.status}`;
    } catch (error) {
      lastError = error.cause?.code || error.message;
    }
    await sleep(1000);
  }
  fail(`${name} did not answer ${url} within ${TIMEOUT_MS / 1000}s (last: ${lastError})`);
}

let cookie = '';

async function proxy(path, init = {}) {
  const headers = { ...(init.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${PROXY_URL}${path}`, { ...init, headers, signal: AbortSignal.timeout(60000) });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const session = setCookies.map((c) => c.split(';')[0]).find((c) => c.startsWith('lomo_session='));
  if (session) cookie = session;
  return res;
}

async function expectStatus(res, expected, what) {
  if (!expected.includes(res.status)) {
    const body = await res.text().catch(() => '');
    fail(`${what}: expected HTTP ${expected.join('/')}, got ${res.status}: ${body.slice(0, 300)}`);
  }
}

async function bucketCount() {
  const res = await proxy('/api/timeline/buckets');
  await expectStatus(res, [200], 'GET /api/timeline/buckets');
  const buckets = await res.json();
  if (!Array.isArray(buckets)) fail(`timeline buckets is not an array: ${JSON.stringify(buckets)}`);
  return buckets.reduce((sum, bucket) => sum + (bucket.count || 0), 0);
}

async function main() {
  // 1. Both services are up
  await waitFor('lomod', `${LOMOD_URL}/status`);
  ok('lomod answers /status');
  await waitFor('proxy', `${PROXY_URL}/`);
  ok('proxy answers /');

  // 2. The web UI is served from the extracted web.zip
  let res = await proxy('/');
  const html = await res.text();
  if (!/<html/i.test(html) || !html.includes('/_app/')) fail('GET / is not the Immich web app');
  ok('GET / serves the Immich web app');
  res = await proxy('/lomo-welcome');
  await expectStatus(res, [200], 'GET /lomo-welcome');
  ok('GET /lomo-welcome serves the first-run welcome page');

  // 3. Create the admin account the way the app's setup does (POST /user on lomod)
  if (ADMIN_HOME) {
    mkdirSync(ADMIN_HOME, { recursive: true });
    res = await createLomodUser(LOMOD_URL, { username: USERNAME, password: PASSWORD, homeDir: ADMIN_HOME });
    await expectStatus(res, [200, 201], 'POST lomod /user');
    ok(`created the ${USERNAME} user`);
  }

  // 4. Sign in through the proxy
  res = await proxy('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: USERNAME, password: PASSWORD }),
  });
  await expectStatus(res, [201], 'POST /api/auth/login');
  const login = await res.json();
  if (!login.accessToken) fail(`login response has no accessToken: ${JSON.stringify(login)}`);
  if (!cookie) fail('login did not set the lomo_session cookie');
  res = await proxy('/api/auth/validateToken', { method: 'POST' });
  await expectStatus(res, [200], 'POST /api/auth/validateToken');
  ok('signed in through the proxy');

  // 5. Empty library
  const before = await bucketCount();
  if (before !== 0) fail(`expected an empty timeline for a new user, got ${before} assets`);
  ok('timeline is empty for the new user');

  // 6. Upload a photo
  const form = new FormData();
  form.append('assetData', new Blob([readFileSync(PHOTO)], { type: 'image/jpeg' }), 'smoke.jpg');
  form.append('fileCreatedAt', '2024-05-17T10:30:00.000Z');
  form.append('fileModifiedAt', '2024-05-17T10:30:00.000Z');
  res = await proxy('/api/assets', { method: 'POST', body: form });
  await expectStatus(res, [201], 'POST /api/assets');
  const { id } = await res.json();
  if (!id) fail('upload response has no asset id');
  ok(`uploaded a photo (asset ${id})`);

  // 7. It shows up in the timeline (bucket counts are cached briefly, so poll)
  let after = 0;
  for (let i = 0; i < 30 && after < 1; i++) {
    after = await bucketCount();
    if (after < 1) await sleep(2000);
  }
  if (after < 1) fail('the uploaded photo never showed up in the timeline buckets');
  ok(`timeline lists the uploaded photo (${after} asset)`);

  // 8. Its thumbnail (lomod renders the preview with libvips)
  res = await proxy(`/api/assets/${encodeURIComponent(id)}/thumbnail?size=thumbnail`);
  await expectStatus(res, [200], `GET /api/assets/${id}/thumbnail`);
  const type = res.headers.get('content-type') || '';
  const thumb = Buffer.from(await res.arrayBuffer());
  if (!type.startsWith('image/') || thumb.length < 100) {
    fail(`thumbnail is not an image (content-type ${type}, ${thumb.length} bytes)`);
  }
  ok(`thumbnail returned (${type}, ${thumb.length} bytes)`);

  // 9. The full-size view (lomod transcodes the original to JPEG)
  res = await proxy(`/api/assets/${encodeURIComponent(id)}/thumbnail?size=preview`);
  await expectStatus(res, [200], `GET /api/assets/${id}/thumbnail?size=preview`);
  const previewType = res.headers.get('content-type') || '';
  const preview = Buffer.from(await res.arrayBuffer());
  if (!previewType.startsWith('image/') || preview.length < 100) {
    fail(`preview is not an image (content-type ${previewType}, ${preview.length} bytes)`);
  }
  ok(`full-size preview returned (${previewType}, ${preview.length} bytes)`);

  console.log('SMOKE PASS');
}

main().catch((error) => {
  console.error(`SMOKE FAIL: ${error.message}`);
  process.exit(1);
});
