// LomoUtils.ts

import * as argon2 from 'argon2-browser'

const ARGON2_SALT = "@lomorage.lomoware"  // do not changed, in the customer side now.

/**
 *
 * @param password
 * @param salt is username
 * @returns
 */
const hashPassword = async (password: string, username: string): Promise<string> => {
  const tCostInIterations = 3;
  const mCostInKibibyte = 4096;
  const parallelism = 1;

  const hashOptions: argon2.Argon2BrowserHashOptions = {
    type: argon2.ArgonType.Argon2id,
    pass: password,
    salt: username + ARGON2_SALT,
    time: tCostInIterations,
    mem: mCostInKibibyte,
    hashLen: 32,
    parallelism,
  };

  try {
    const hashResult = await argon2.hash(hashOptions);
    console.log(`hash.hex = ${hashResult.hashHex}, hash = ${hashResult.hash}`)
    return hashResult.encoded;
  } catch (error) {
    console.error('Hashing failed:', error);
    throw error;
  }
};



export default hashPassword
