import { sql } from 'drizzle-orm';
import { useDb } from '../db/client.js';

/** Health check including the database. Public, for monitoring. */
export default defineEventHandler(async (event) => {
  const start = Date.now();
  try {
    await useDb().execute(sql`select 1`);
    return {
      status: 'ok' as const,
      database: 'reachable' as const,
      durationMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    setResponseStatus(event, 503);
    return {
      status: 'fehler' as const,
      database: 'unreachable' as const,
      durationMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
      // Public route: only show details locally.
      ...(import.meta.dev
        ? { message: error instanceof Error ? error.message : String(error) }
        : {}),
    };
  }
});
