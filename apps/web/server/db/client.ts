/**
 * Datenbankverbindung.
 *
 * Der Pool wird traege beim ersten Zugriff aufgebaut und danach
 * wiederverwendet. Die Verbindungszeichenfolge kommt ausschliesslich aus der
 * Umgebung, gelesen ueber runtimeConfig: lokal und produktiv unterscheiden
 * sich allein in der .env-Datei. Nichts ist hartkodiert.
 *
 * drizzle-kit laeuft ausserhalb von Nitro und hat keine runtimeConfig; dort
 * greift der Rueckfall auf process.env.
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
    // Ausserhalb eines Nitro-Kontexts, etwa in einem Skript.
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
      // Bewusst knapp gehalten: die Anwendung laeuft einprozessig und
      // beantwortet keine hohen Lastspitzen.
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
