/**
 * Lazily created connection pool. The URL comes from runtimeConfig, with a
 * fallback to process.env for scripts like drizzle-kit.
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

let pool: Pool | undefined;

function databaseUrl(): string {
  let url: string | undefined;
  try {
    url = useRuntimeConfig().databaseUrl;
  } catch {
    // Outside a Nitro context, e.g. in a script.
    url = undefined;
  }
  const value = url || process.env.DATABASE_URL;
  if (!value) {
    throw new Error(
      'DATABASE_URL ist nicht gesetzt. .env.example nach .env kopieren und den Wert eintragen.',
    );
  }
  return value;
}

export function getPool(): Pool {
  if (pool === undefined) {
    pool = new Pool({
      connectionString: databaseUrl(),
      // Small pool: low traffic, one user.
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

let db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function useDb() {
  if (db === undefined) {
    db = drizzle(getPool(), { schema });
  }
  return db;
}

export { schema };
