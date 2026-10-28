import { eq } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { updateSaleSchema } from '../../../shared/schemas/sale.js';
import { readId, readJsonBody, requireFound } from '../../utils/validation.js';
import { conflict } from '../../utils/errors.js';
import { loadSales } from '../../utils/sales.js';

/** Marks a sale as shipped or back to open; a cancelled sale stays cancelled. */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const { status } = await readJsonBody(event, updateSaleSchema);
  const db = useDb();

  const sale = requireFound(
    await db.query.sales.findFirst({ where: eq(schema.sales.id, id), columns: { status: true } }),
    'Der Verkauf',
  );
  if (sale.status === 'cancelled') throw conflict('Ein stornierter Verkauf lässt sich nicht mehr ändern.');

  await db.update(schema.sales).set({ status }).where(eq(schema.sales.id, id));
  const [updated] = await loadSales(db, [id]);
  return requireFound(updated, 'Der Verkauf');
});
