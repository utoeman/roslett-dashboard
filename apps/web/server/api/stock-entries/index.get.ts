import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { buildVariantLabel } from '@trd/core';
import { schema, useDb } from '../../db/client.js';
import { journalQuerySchema } from '../../../shared/schemas/stock-entry.js';
import { readQuery } from '../../utils/validation.js';

/** Journal, newest first, with batches, open shortfall and reversal links. */
export default defineEventHandler(async (event) => {
  const { limit, offset, variantId, kind, shortfallsOnly } = readQuery(event, journalQuerySchema);
  const db = useDb();

  const conditions = [];
  if (variantId) conditions.push(eq(schema.stockEntries.variantId, variantId));
  if (kind) conditions.push(eq(schema.stockEntries.kind, kind));
  if (shortfallsOnly) {
    conditions.push(
      // Column reference instead of a literal: relational queries alias the table.
      sql`exists (select 1 from batch_allocations a where a.stock_entry_id = ${schema.stockEntries.id}
        and a.batch_id is null and a.resolved_at is null and a.quantity < 0)`,
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const entries = await db.query.stockEntries.findMany({
    where,
    orderBy: [desc(schema.stockEntries.postedAt), desc(schema.stockEntries.createdAt)],
    limit,
    offset,
    with: {
      variant: { with: { color: true, product: { columns: { name: true } } } },
      allocations: { with: { batch: { with: { goodsReceipt: { columns: { number: true } } } } } },
    },
  });

  const ids = entries.map((e) => e.id);
  const reversedBy =
    ids.length > 0
      ? await db
          .select({ id: schema.stockEntries.id, reversesId: schema.stockEntries.reversesId })
          .from(schema.stockEntries)
          .where(inArray(schema.stockEntries.reversesId, ids))
      : [];

  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.stockEntries)
    .where(where);

  return {
    items: entries.map((e) => ({
      id: e.id,
      postedAt: e.postedAt,
      kind: e.kind,
      quantity: e.quantity,
      note: e.note,
      variant: {
        id: e.variant.id,
        sku: e.variant.sku,
        label: buildVariantLabel(e.variant.color?.name, e.variant.size),
        productName: e.variant.product.name,
      },
      batches: e.allocations
        .filter((a) => a.batch !== null)
        .map((a) => ({ batchId: a.batchId, receiptNumber: a.batch?.goodsReceipt.number ?? null, quantity: a.quantity })),
      openShortfall: e.allocations
        .filter((a) => a.batchId === null && a.resolvedAt === null && a.quantity < 0)
        .reduce((sum, a) => sum + a.quantity, 0),
      reversesId: e.reversesId,
      reversedById: reversedBy.find((r) => r.reversesId === e.id)?.id ?? null,
    })),
    total,
    limit,
    offset,
  };
});
