// The credential lomod stores for a user, derived from their plaintext password. Same
// derivation as hashPasswordForLomo in proxy/routes/auth.ts (used at login) and
// hash_password_for_lomo in src-tauri/src/main.rs (desktop setup); all three must agree.
//
//   1. argon2id(password, salt=username+"@lomorage.lomoware", t=3, m=4096, p=1, len=32)
//   2. PHC string: $argon2id$v=19$m=4096,t=3,p=1$<saltB64>$<hashB64>
//   3. hex-encode its bytes and append "00"
//
// hash-wasm comes from proxy/node_modules (the proxy depends on it), found relative to this file.

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export async function lomoCredential(password, username) {
  const { argon2id } = createRequire(join(here, '../../proxy/package.json'))('hash-wasm');
  const salt = `${username}@lomorage.lomoware`;
  const hashHex = await argon2id({
    password,
    salt: new Uint8Array(Buffer.from(salt)),
    iterations: 3,
    memorySize: 4096,
    parallelism: 1,
    hashLength: 32,
    outputType: 'hex',
  });
  const saltB64 = Buffer.from(salt).toString('base64').replace(/=+$/, '');
  const hashB64 = Buffer.from(hashHex, 'hex').toString('base64').replace(/=+$/, '');
  const encoded = `$argon2id$v=19$m=4096,t=3,p=1$${saltB64}$${hashB64}`;
  return `${Buffer.from(encoded, 'latin1').toString('hex')}00`;
}

// Creates a lomod user the way the desktop app's first-run setup does: POST /user, which lomod
// accepts without a token. Returns the fetch Response.
export async function createLomodUser(lomodUrl, { username, password, homeDir }) {
  return fetch(`${lomodUrl.replace(/\/$/, '')}/user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Name: username,
      Password: await lomoCredential(password, username),
      HomeDir: homeDir.replace(/\\/g, '/'),
    }),
  });
}
