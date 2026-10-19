/**
 * Zugangspasswort der App.
 *
 * Das Werkzeug hat genau eine Nutzerin; statt einer Benutzerverwaltung schuetzt
 * ein einziges Passwort alles. Gespeichert wird nur sein Hash, in der
 * Umgebungsvariable NUXT_ACCESS_PASSWORD_HASH.
 *
 * Format: "scrypt:<salz hex>:<hash hex>". Bewusst ohne Dollarzeichen – die
 * .env-Dateien von Nuxt ersetzen "$name" durch andere Variablen und wuerden
 * einen Hash im ueblichen "$scrypt$…"-Format still verfaelschen.
 *
 * Erzeugen: npm run passwort:hash
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

/**
 * Prueft ein Passwort gegen den gespeicherten Hash.
 *
 * Ein fehlender oder kaputter Hash ergibt `false` statt eines Fehlers: eine
 * falsch gesetzte Umgebungsvariable darf die Anmeldung sperren, aber nie
 * oeffnen.
 */
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
  // Vergleich in konstanter Zeit, damit die Antwortdauer nichts verraet.
  return timingSafeEqual(actual, expected);
}
