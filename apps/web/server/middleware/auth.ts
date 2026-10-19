/**
 * Zugangsschutz fuer die API.
 *
 * Jeder Aufruf unter /api/ braucht eine gueltige Sitzung. Frei bleiben nur:
 * - /api/health: Ueberwachung ohne Anmeldung (siehe health.get.ts)
 * - /api/auth/login: sonst koennte man sich nie anmelden
 * - /api/_auth/session: Sitzungsabfrage von nuxt-auth-utils, antwortet ohne
 *   Sitzung ohnehin nur mit einem leeren Objekt
 *
 * Die Seiten selbst sind statisch (ssr: false) und enthalten keine Daten; den
 * Umweg zur Anmeldeseite uebernimmt app/middleware/auth.global.ts.
 */

const PUBLIC_PATHS = new Set(['/api/health', '/api/auth/login', '/api/_auth/session']);

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname;
  if (!path.startsWith('/api/') || PUBLIC_PATHS.has(path)) {
    return;
  }

  const session = await getUserSession(event);
  if (!session.user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Nicht angemeldet',
      data: { fehler: 'Bitte zuerst anmelden.' },
    });
  }
});
