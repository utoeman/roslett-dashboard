/**
 * Every /api route requires a session, except health, login, the
 * nuxt-auth-utils session endpoint and cron routes (own secret check). Pages are static (ssr: false); the client
 * redirect lives in app/middleware/auth.global.ts.
 */

const PUBLIC_PATHS = new Set(['/api/health', '/api/auth/login', '/api/_auth/session', '/api/cron/shopify-sync']);

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
