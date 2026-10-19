import { describe, expect, it } from 'vitest';
import { hashAccessPassword, verifyAccessPassword } from '../server/utils/access-password';
import { LoginAttempts } from '../server/utils/login-attempts';

describe('Zugangspasswort', () => {
  it('erkennt das richtige Passwort', async () => {
    const hash = await hashAccessPassword('Leinen und Oliv 2026');
    expect(await verifyAccessPassword('Leinen und Oliv 2026', hash)).toBe(true);
  });

  it('weist ein falsches Passwort ab', async () => {
    const hash = await hashAccessPassword('Leinen und Oliv 2026');
    expect(await verifyAccessPassword('leinen und oliv 2026', hash)).toBe(false);
    expect(await verifyAccessPassword('', hash)).toBe(false);
  });

  it('erzeugt bei gleichem Passwort verschiedene Hashes (Salz)', async () => {
    const a = await hashAccessPassword('gleich und lang genug');
    const b = await hashAccessPassword('gleich und lang genug');
    expect(a).not.toBe(b);
  });

  it('enthaelt kein Dollarzeichen, damit .env-Dateien den Wert nicht verfaelschen', async () => {
    const hash = await hashAccessPassword('beliebig und lang genug');
    expect(hash).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
  });

  it('weist einen kaputten oder leeren Hash ab, statt zu werfen', async () => {
    expect(await verifyAccessPassword('x', '')).toBe(false);
    expect(await verifyAccessPassword('x', 'scrypt:zz:zz')).toBe(false);
    expect(await verifyAccessPassword('x', 'bcrypt:abc:def')).toBe(false);
  });

  it('verlangt beim Erzeugen mindestens 12 Zeichen', async () => {
    await expect(hashAccessPassword('zu kurz')).rejects.toThrow(/12 Zeichen/);
  });
});

describe('Sperre nach Fehlversuchen', () => {
  const minute = 60_000;

  it('erlaubt die ersten fuenf Versuche', () => {
    const attempts = new LoginAttempts();
    for (let i = 0; i < 5; i += 1) {
      expect(attempts.isBlocked('1.2.3.4', 0)).toBe(false);
      attempts.recordFailure('1.2.3.4', 0);
    }
    expect(attempts.isBlocked('1.2.3.4', 0)).toBe(true);
  });

  it('sperrt nur die betroffene Adresse', () => {
    const attempts = new LoginAttempts();
    for (let i = 0; i < 5; i += 1) attempts.recordFailure('1.2.3.4', 0);
    expect(attempts.isBlocked('5.6.7.8', 0)).toBe(false);
  });

  it('hebt die Sperre nach 15 Minuten auf', () => {
    const attempts = new LoginAttempts();
    for (let i = 0; i < 5; i += 1) attempts.recordFailure('1.2.3.4', 0);
    expect(attempts.isBlocked('1.2.3.4', 15 * minute - 1)).toBe(true);
    expect(attempts.isBlocked('1.2.3.4', 15 * minute)).toBe(false);
  });

  it('setzt den Zaehler nach erfolgreicher Anmeldung zurueck', () => {
    const attempts = new LoginAttempts();
    for (let i = 0; i < 4; i += 1) attempts.recordFailure('1.2.3.4', 0);
    attempts.reset('1.2.3.4');
    attempts.recordFailure('1.2.3.4', 0);
    expect(attempts.isBlocked('1.2.3.4', 0)).toBe(false);
  });
});
