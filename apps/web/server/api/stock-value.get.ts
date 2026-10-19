import { isNull } from 'drizzle-orm';
import { schema, useDb } from '../db/client.js';
import { stockFigures } from '../utils/inventory.js';

/** Totals for the overview: units in stock, FIFO stock value, variants below minimum. */
export default defineEventHandler(async () => {
  const db = useDb();
  const variants = await db
    .select({ id: schema.variants.id, minimumStock: schema.variants.minimumStock })
    .from(schema.variants)
    .where(isNull(schema.variants.archivedAt));
  const figures = await stockFigures(
    db,
    variants.map((v) => v.id),
  );

  let units = 0;
  let valueEur = 0;
  let variantsBelowMinimum = 0;
  for (const variant of variants) {
    const f = figures.get(variant.id);
    units += Math.max(0, f?.stock ?? 0);
    valueEur += f?.stockValueEur ?? 0;
    if (variant.minimumStock > 0 && (f?.stock ?? 0) < variant.minimumStock) variantsBelowMinimum += 1;
  }
  return { units, valueEur, variantsBelowMinimum };
});
