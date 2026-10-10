/**
 * First-run account setup in the browser, for deployments that have no desktop setup screen
 * (the Docker image). Enabled by LOMO_WEB_SETUP=1; otherwise none of this does anything.
 *
 * While the bundled lomod (LOMO_BACKEND_URL) has no account yet, page loads are redirected to
 * /lomo-setup, where the first visitor picks the password of the admin account
 * (LOMO_ADMIN_USER, default "admin"). POST /api/lomo/setup creates it the way the desktop app
 * does: POST /user on lomod, which lomod accepts without a token only while it has no account.
 *
 * Its photo home is LOMO_ADMIN_HOME (a path in lomod's mount dir, created by the entrypoint).
 */
import { Router, Request, Response, NextFunction } from 'express';
import { lomoFetch } from './http-agent';
import { lomoCredential } from './routes/auth';

const ENABLED = process.env.LOMO_WEB_SETUP === '1';
const BACKEND = (process.env.LOMO_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
const ADMIN_USER = (process.env.LOMO_ADMIN_USER || 'admin').trim();
const ADMIN_HOME = process.env.LOMO_ADMIN_HOME || '';
const MIN_PASSWORD_LENGTH = 6;

let accountExists = !ENABLED;

// lomod serves its first-run page at /welcome (200) only while it has no account, and
// redirects once one exists. Once an account is seen, stop asking.
async function setupNeeded(): Promise<boolean> {
  if (accountExists) return false;
  try {
    const res = await lomoFetch(`${BACKEND}/welcome`, { redirect: 'manual' });
    if (res.status === 200) return true;
    accountExists = true;
  } catch (error) {
    console.error('[setup] could not reach lomod:', error);
  }
  return false;
}

// Redirect page loads (not API calls or static files) to the setup page until it is done.
export async function webSetupRedirect(req: Request, res: Response, next: NextFunction) {
  if (accountExists || req.method !== 'GET' || req.path.startsWith('/api/') || req.path === '/lomo-setup') {
    return next();
  }
  const isPage = req.path === '/' || !req.path.split('/').pop()?.includes('.');
  if (isPage && !req.path.startsWith('/_app/') && (await setupNeeded())) {
    return res.redirect(302, '/lomo-setup');
  }
  next();
}

export const webSetupRouter = Router();

webSetupRouter.get('/lomo-setup', async (_req, res) => {
  if (!ENABLED || !(await setupNeeded())) {
    return res.redirect(302, '/');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(SETUP_HTML.replace(/__ADMIN_USER__/g, escapeHtml(ADMIN_USER)).replace(/__MIN__/g, String(MIN_PASSWORD_LENGTH)));
});

webSetupRouter.get('/api/lomo/setup', async (_req, res) => {
  res.json({ enabled: ENABLED, needed: ENABLED && (await setupNeeded()), username: ADMIN_USER });
});

webSetupRouter.post('/api/lomo/setup', async (req, res) => {
  if (!ENABLED) {
    return res.status(404).json({ message: 'Not available' });
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  if (!(await setupNeeded())) {
    return res.status(409).json({ message: 'The account is already set up; sign in instead' });
  }

  try {
    const lomoRes = await lomoFetch(`${BACKEND}/user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Name: ADMIN_USER,
        Password: await lomoCredential(password, ADMIN_USER),
        HomeDir: ADMIN_HOME.replace(/\\/g, '/'),
      }),
    });
    if (lomoRes.status === 401) {
      // Someone else finished setup first: lomod only takes an untokened POST /user with no account.
      accountExists = true;
      return res.status(409).json({ message: 'The account is already set up; sign in instead' });
    }
    if (!lomoRes.ok) {
      const text = await lomoRes.text();
      console.error(`[setup] creating ${ADMIN_USER} failed: ${lomoRes.status} ${text}`);
      return res.status(502).json({ message: `Creating the account failed (lomod ${lomoRes.status})` });
    }
    accountExists = true;
    console.log(`[setup] created the ${ADMIN_USER} account from the web setup page`);
    res.status(201).json({ username: ADMIN_USER });
  } catch (error) {
    console.error('[setup] error:', error);
    res.status(500).json({ message: 'Creating the account failed' });
  }
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const SETUP_HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Set up Lomorage</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: radial-gradient(ellipse at 20% 0%, #2c2560, #15122a 60%); color: #e8e5f7; padding: 24px 16px;
  }
  .card { width: 100%; max-width: 420px; background: #221d3d; border: 1px solid #332c5e; border-radius: 20px; padding: 32px 28px; }
  h1 { margin: 0 0 4px; font-size: 26px; color: #8f86ff; }
  .sub { margin: 0 0 24px; color: #a9a3c9; font-size: 15px; line-height: 1.5; }
  label { display: block; font-size: 14px; margin: 16px 0 6px; color: #cfcae8; }
  input { width: 100%; padding: 13px 14px; border-radius: 12px; border: 1px solid #3a335f; background: #2a2449; color: #fff; font-size: 16px; }
  input[readonly] { color: #a9a3c9; }
  button { width: 100%; margin-top: 24px; padding: 14px; border: 0; border-radius: 999px; background: #5146c7; color: #fff; font-size: 17px; font-weight: 600; }
  button:disabled { opacity: .6; }
  .msg { margin-top: 16px; padding: 12px 14px; border-radius: 12px; font-size: 14px; display: none; }
  .err { display: block; background: #3a1f33; border: 1px solid #6b2c45; color: #ff8fa8; }
  .ok { display: block; background: #1f3a2c; border: 1px solid #2c6b4a; color: #8fffc0; }
  .hint { margin-top: 20px; font-size: 13px; color: #8d86ad; line-height: 1.5; }
</style>
</head>
<body>
<form class="card" id="f">
  <h1>Welcome to Lomorage</h1>
  <p class="sub">Choose the password for your account. You'll use it to sign in here and in the Lomorage mobile app.</p>
  <label for="u">Username</label>
  <input id="u" value="__ADMIN_USER__" readonly />
  <label for="p">Password (at least __MIN__ characters)</label>
  <input id="p" type="password" autocomplete="new-password" minlength="__MIN__" required autofocus />
  <label for="c">Confirm password</label>
  <input id="c" type="password" autocomplete="new-password" required />
  <button id="b" type="submit">Create account</button>
  <div class="msg" id="m"></div>
  <p class="hint">Only the first visitor sets this password. Afterwards this page leads to the normal sign-in.</p>
</form>
<script>
  const f = document.getElementById('f'), m = document.getElementById('m'), b = document.getElementById('b');
  const show = (text, cls) => { m.textContent = text; m.className = 'msg ' + cls; };
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const p = document.getElementById('p').value, c = document.getElementById('c').value;
    if (p.length < __MIN__) return show('The password must be at least __MIN__ characters.', 'err');
    if (p !== c) return show('The passwords do not match.', 'err');
    b.disabled = true;
    try {
      const res = await fetch('/api/lomo/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: p }) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 201) {
        show('Account created. Taking you to sign in…', 'ok');
        setTimeout(() => { location.href = '/auth/login'; }, 1200);
      } else if (res.status === 409) {
        show(data.message || 'Already set up.', 'err');
        setTimeout(() => { location.href = '/auth/login'; }, 2000);
      } else {
        show(data.message || ('Error ' + res.status), 'err');
        b.disabled = false;
      }
    } catch (err) {
      show('Could not reach the server: ' + err, 'err');
      b.disabled = false;
    }
  });
</script>
</body>
</html>
`;
