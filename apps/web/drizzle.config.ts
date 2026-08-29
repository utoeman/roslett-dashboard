import { defineConfig } from 'drizzle-kit';

/**
 * Migrationen laufen ausschliesslich ueber einen ausdruecklichen Befehl,
 * niemals automatisch beim Start der Anwendung. Auf einem Server waere eine
 * Migration beim Hochfahren gefaehrlich: mehrere Instanzen wuerden gleichzeitig
 * migrieren, und ein fehlgeschlagener Deploy liesse ein halb migriertes
 * Schema zurueck.
 */
export default defineConfig({
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
});
