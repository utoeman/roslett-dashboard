import { count, eq } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { readId, requireFound } from '../../utils/validation.js';
import { conflict, databaseError } from '../../utils/errors.js';

/** Deletes an archived supplier that no goods receipt or production ever used; otherwise it stays archived. */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const db = useDb();
  const supplier = requireFound(
    await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, id), columns: { archivedAt: true } }),
    'Der Lieferant',
  );
  if (supplier.archivedAt === null) throw conflict('Bitte den Lieferanten zuerst archivieren.');

  const [used] = await db
    .select({ n: count() })
    .from(schema.goodsReceipts)
    .where(eq(schema.goodsReceipts.supplierId, id));
  if ((used?.n ?? 0) > 0) {
    throw conflict(`Der Lieferant steht in ${used?.n} Wareneingang/Produktion(en) und bleibt archiviert.`);
  }
  try {
    await db.delete(schema.suppliers).where(eq(schema.suppliers.id, id));
  } catch (error) {
    throw databaseError(error, 'Lieferant löschen');
  }
  setResponseStatus(event, 204);
  return null;
});
