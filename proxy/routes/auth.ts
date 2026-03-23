import { Router } from 'express';
import fetch from 'node-fetch';
import { argon2id } from 'hash-wasm';
import { createSession, deleteSession } from '../session';

const DEFAULT_LOMO_URL = process.env.LOMO_BACKEND_URL || 'http://192.168.1.73:8000';

export const authRouter = Router();

/**
 * Argon2 password hashing matching LomoUtils.ts logic.
 * Uses hash-wasm (inline WASM, works in bundled exe).
 *
 * Flow:
 * 1. argon2id(password, salt=username+"@lomorage.lomoware", time=3, mem=4096, parallelism=1, hashLen=32)
 * 2. Take encoded result, convert via stringToHexByte() + append "00"
 * 3. Basic Auth = base64(username:hexHash00:deviceName)
 */
async function hashPasswordForLomo(password: string, username: string): Promise<string> {
  const salt = username + '@lomorage.lomoware';
  const saltBytes = new Uint8Array(Buffer.from(salt));

  const hashHex = await argon2id({
    password,
    salt: saltBytes,
    iterations: 3,
    memorySize: 4096,  // in KiB
    parallelism: 1,
    hashLength: 32,
    outputType: 'hex',
  });

  // Build the encoded string in PHC format (matching argon2 native output)
  const saltB64 = Buffer.from(salt).toString('base64').replace(/=+$/, '');
  const hashB64 = Buffer.from(hashHex, 'hex').toString('base64').replace(/=+$/, '');
  const encoded = `$argon2id$v=19$m=4096,t=3,p=1$${saltB64}$${hashB64}`;

  return encoded;
}

function stringToHexByte(str: string): string {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i);
  }
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16);
  }
  return hex;
}

// POST /api/auth/login
authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const username = email; // Immich uses email, lomo uses username
    const serverUrl = (req.headers['x-lomo-server'] as string) || DEFAULT_LOMO_URL;

    console.log(`[auth] Login attempt: user=${username}, server=${serverUrl}`);

    // Hash password using Argon2 (matching LomoService.ts logic)
    const encoded = await hashPasswordForLomo(password, username);
    console.log(`[auth] Argon2 encoded: ${encoded}`);

    const hashedPwd = stringToHexByte(encoded) + '00';
    console.log(`[auth] Hex hash: ${hashedPwd.substring(0, 40)}...`);

    // Build Basic Auth header
    const base64Credentials = Buffer.from(`${username}:${hashedPwd}:immich-web`).toString('base64');

    // Call lomo-backend login
    const lomoRes = await fetch(`${serverUrl}/login`, {
      headers: {
        Authorization: `Basic ${base64Credentials}`,
      },
    });

    if (!lomoRes.ok) {
      const errorText = await lomoRes.text();
      console.error(`[auth] Login failed: ${lomoRes.status} ${errorText}`);
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const data = await lomoRes.json() as { Token: string; Userid: number };
    console.log(`[auth] Login success: user=${username}, userId=${data.Userid}`);

    // Create session
    const sessionId = createSession(data.Token, String(data.Userid), username, serverUrl);

    // Set cookies that Immich web expects
    res.cookie('immich_is_authenticated', 'true', { path: '/', httpOnly: false });
    res.cookie('immich_auth_type', 'password', { path: '/', httpOnly: false });
    res.cookie('lomo_session', sessionId, { path: '/', httpOnly: true });

    // Return Immich LoginResponseDto format (SDK expects 201)
    res.status(201).json({
      accessToken: data.Token,
      isAdmin: true,
      isOnboarded: true,
      name: username,
      profileImagePath: '',
      shouldChangePassword: false,
      userEmail: username,
      userId: String(data.Userid),
    });
  } catch (error) {
    console.error('[auth] Login error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
});

// POST /api/auth/validateToken
authRouter.post('/validateToken', (req, res) => {
  const sessionId = req.cookies?.lomo_session;
  if (sessionId) {
    res.json({ authStatus: true });
  } else {
    res.status(401).json({ authStatus: false });
  }
});

// POST /api/auth/logout
authRouter.post('/logout', (req, res) => {
  const sessionId = req.cookies?.lomo_session;
  if (sessionId) {
    deleteSession(sessionId);
  }
  res.clearCookie('immich_is_authenticated');
  res.clearCookie('immich_auth_type');
  res.clearCookie('lomo_session');
  res.json({ successful: true, redirectUri: '/auth/login' });
});
