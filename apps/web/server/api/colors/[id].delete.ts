import { count, eq } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { readId, requireFound } from '../../utils/validation.js';
import { conflict, databaseError } from '../../utils/errors.js';

/** Deletes an archived color that no variant ever used; otherwise it stays archived. */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const db = useDb();
  const color = requireFound(
    await db.query.colors.findFirst({ where: eq(schema.colors.id, id), columns: { archivedAt: true } }),
    'Die Farbe',
  );
  if (color.archivedAt === null) throw conflict('Bitte die Farbe zuerst archivieren.');

  const [used] = await db.select({ n: count() }).from(schema.variants).where(eq(schema.variants.colorId, id));
  if ((used?.n ?? 0) > 0) {
    throw conflict(`Die Farbe wird von ${used?.n} Variante(n) verwendet und bleibt archiviert.`);
  }
  try {
    await db.delete(schema.colors).where(eq(schema.colors.id, id));
  } catch (error) {
    throw databaseError(error, 'Farbe löschen');
  }
  setResponseStatus(event, 204);
  return null;
});
