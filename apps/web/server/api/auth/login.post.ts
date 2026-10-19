import { z } from 'zod';
import { verifyAccessPassword } from '../../utils/access-password.js';
import { LoginAttempts } from '../../utils/login-attempts.js';
import { readJsonBody } from '../../utils/validation.js';

/** Login with the access password; sets an encrypted session cookie. */

const loginSchema = z.object({
  password: z.string().min(1, 'Bitte das Passwort eingeben.').max(200),
});

// Lives as long as the server instance.
const attempts = new LoginAttempts();

export default defineEventHandler(async (event) => {
  const { password } = await readJsonBody(event, loginSchema);
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unbekannt';
  const now = Date.now();

  if (attempts.isBlocked(ip, now)) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Zu viele Versuche',
      data: { fehler: 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.' },
    });
  }

  const storedHash = useRuntimeConfig(event).accessPasswordHash;
  if (!storedHash) {
    // Fail loudly rather than let everyone in.
    throw createError({
      statusCode: 500,
      statusMessage: 'Nicht eingerichtet',
      data: { fehler: 'Kein Zugangspasswort hinterlegt (NUXT_ACCESS_PASSWORD_HASH fehlt).' },
    });
  }

  if (!(await verifyAccessPassword(password, storedHash))) {
    attempts.recordFailure(ip, now);
    throw createError({
      statusCode: 401,
      statusMessage: 'Nicht angemeldet',
      data: { fehler: 'Das Passwort ist nicht richtig.', felder: { password: 'Nicht richtig.' } },
    });
  }

  attempts.reset(ip);
  await setUserSession(event, {
    user: { role: 'inhaberin' },
    loggedInAt: new Date().toISOString(),
  });
  return { ok: true };
});
