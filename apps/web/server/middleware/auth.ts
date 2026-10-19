/**
 * Every /api route requires a session, except health, login and the
 * nuxt-auth-utils session endpoint. Pages are static (ssr: false); the client
 * redirect lives in app/middleware/auth.global.ts.
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
