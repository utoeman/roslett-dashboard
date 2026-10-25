import { schema, useDb } from '../../db/client.js';

/** Manufacturer details; 204 (no content) until they are entered once. */
export default defineEventHandler(async () => {
  const [row] = await useDb().select().from(schema.companySettings).limit(1);
  return row ?? null;
});
