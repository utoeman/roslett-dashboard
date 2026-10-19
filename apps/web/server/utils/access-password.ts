/**
 * Single access password, stored only as a hash in NUXT_ACCESS_PASSWORD_HASH
 * (create with `npm run passwort:hash`).
 *
 * Format "scrypt:<salt hex>:<hash hex>" without "$": Nuxt's .env loader would
 * expand "$scrypt$…" as variables and silently corrupt the hash.
 */

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const PREFIX = 'scrypt';
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const MIN_LENGTH = 12;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_BYTES, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashAccessPassword(password: string): Promise<string> {
  if (password.length < MIN_LENGTH) {
    throw new Error(`Das Passwort braucht mindestens ${MIN_LENGTH} Zeichen.`);
  }
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt);
  return `${PREFIX}:${salt.toString('hex')}:${key.toString('hex')}`;
}

/** A missing or malformed hash returns false: misconfiguration locks, never opens. */
export async function verifyAccessPassword(password: string, stored: string): Promise<boolean> {
  const [prefix, saltHex, keyHex] = stored.split(':');
  const hexPattern = /^[0-9a-f]+$/;
  if (prefix !== PREFIX || !saltHex || !keyHex || !hexPattern.test(saltHex) || !hexPattern.test(keyHex)) {
    return false;
  }
  const expected = Buffer.from(keyHex, 'hex');
  if (expected.length !== KEY_BYTES) {
    return false;
  }
  const actual = await derive(password, Buffer.from(saltHex, 'hex'));
  // Constant-time comparison.
  return timingSafeEqual(actual, expected);
}
