// LomoService.ts

import axios from 'axios';

import hashPassword  from './LomoUtils'

const BASE_URL = 'http://192.168.1.73:8000';


function stringToHex(str: string): string {
  let hex = '';
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    const hexValue = charCode.toString(16);
    // Pad with zeros to ensure two-digit representation
    hex += hexValue.padStart(2, '0');
  }
  return hex;
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

/**
 * Example API function (you can add more API functions here).
 * @param username The username.
 * @param password The password.
 * @returns A Promise that resolves to the response data.
 */
export async function login(username: string, password: string): Promise<any> {
  // const credentials = `${username}:${password}`;
  const credentials = await hashPassword(password, username)
  const hasdedPwd = stringToHexByte(credentials) + '00'
  console.log(`hash = ${hasdedPwd}`)
  // var baAuthBase64 = LomoUtils.toBase64(username + ":" + encryptPassword + ":" + LomoUtils.getDeviceName())
  // baAuthBase64 = "Basic " + baAuthBase64
  const base64Credentials = btoa(`${username}:${hasdedPwd}:react`);

  try {
    const response = await axios.get(`${BASE_URL}/login`, {
      headers: {
        Authorization: `Basic ${base64Credentials}`,
      },
    });

    return response.data;
  } catch (error) {
    throw error;
  }
}


interface Day {
  Hash: string;
  // Other properties of Day
}

interface Month {
  Days: Day[];
  Hash: string;
  Month: number;
}

interface Year {
  Hash: string;
  Months: Month[];
  Year: number;
}

export interface AssetList {
  Hash: string;
  Years: Year[];
}

export async function listAllAssets(token: string): Promise<AssetList> {
  try {
    const response = await axios.get(`${BASE_URL}/assets/merkletree`, {
      params: {
        token,
      },
    });

    return response.data;
  } catch (error) {
    throw error;
  }
}
