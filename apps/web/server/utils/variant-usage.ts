/**
 * Whether variants were ever booked, received or sold (G25). Used variants
 * must stay: the journal and sales have to remain traceable.
 */

import { count, inArray } from 'drizzle-orm';
import { schema, type useDb } from '../db/client.js';

type Reader = Pick<ReturnType<typeof useDb>, 'select'>;

/** Human-readable uses, empty when the variants can be deleted. */
export async function variantUses(db: Reader, variantIds: readonly string[]): Promise<string[]> {
  if (variantIds.length === 0) return [];
  const ids = [...variantIds];
  const countIn = async (table: typeof schema.stockEntries | typeof schema.batches | typeof schema.saleItems) => {
    const [row] = await db.select({ n: count() }).from(table).where(inArray(table.variantId, ids));
    return row?.n ?? 0;
  };
  const [entries, batches, sales] = await Promise.all([
    countIn(schema.stockEntries),
    countIn(schema.batches),
    countIn(schema.saleItems),
  ]);
  return [
    entries > 0 ? `${entries} Buchung(en)` : null,
    batches > 0 ? `${batches} Wareneingangsposition(en)` : null,
    sales > 0 ? `${sales} Verkaufsposition(en)` : null,
  ].filter((u): u is string => u !== null);
}
