import { defineConfig } from 'drizzle-kit';

/**
 * Migrations run only via an explicit command (locally or in the release
 * workflow), never on startup where several instances could race.
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
