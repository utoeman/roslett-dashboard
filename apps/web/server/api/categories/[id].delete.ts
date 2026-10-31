import { count, eq } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { readId, requireFound } from '../../utils/validation.js';
import { conflict, databaseError } from '../../utils/errors.js';

/** Deletes an archived category that no product ever used; otherwise it stays archived. */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const db = useDb();
  const category = requireFound(
    await db.query.categories.findFirst({ where: eq(schema.categories.id, id), columns: { archivedAt: true } }),
    'Die Kategorie',
  );
  if (category.archivedAt === null) throw conflict('Bitte die Kategorie zuerst archivieren.');

  const [used] = await db.select({ n: count() }).from(schema.products).where(eq(schema.products.categoryId, id));
  if ((used?.n ?? 0) > 0) {
    throw conflict(`Die Kategorie wird von ${used?.n} Produkt(en) verwendet und bleibt archiviert.`);
  }
  try {
    await db.delete(schema.categories).where(eq(schema.categories.id, id));
  } catch (error) {
    throw databaseError(error, 'Kategorie löschen');
  }
  setResponseStatus(event, 204);
  return null;
});
