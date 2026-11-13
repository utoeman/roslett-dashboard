/**
 * Deleting a posted goods receipt (G32): loads the journal entries on its
 * batches and plans what goes and what Shopify gets back.
 */

import { eq, inArray } from 'drizzle-orm';
import { planReceiptDeletion } from '@roslett/core';
import { schema, type useDb } from '../db/client.js';

type Db = ReturnType<typeof useDb>;
type Reader = Pick<Db, 'select' | 'selectDistinct' | 'query'>;

export const ENTRY_KIND_LABELS: Record<string, string> = {
  goods_receipt: 'Wareneingang',
  sale: 'Verkauf',
  return: 'Retoure',
  shrinkage: 'Schwund',
  own_use: 'Eigenverbrauch',
  stocktake: 'Inventur',
  supplier_return: 'Rückgabe an Lieferant',
  reversal: 'Storno',
};

export async function loadReceiptDeletion(db: Reader, receiptId: string) {
  const batchIds = (
    await db.select({ id: schema.batches.id }).from(schema.batches).where(eq(schema.batches.goodsReceiptId, receiptId))
  ).map((b) => b.id);

  const entries =
    batchIds.length === 0
      ? []
      : await db
          .selectDistinct({
            id: schema.stockEntries.id,
            kind: schema.stockEntries.kind,
            reversesId: schema.stockEntries.reversesId,
            variantId: schema.stockEntries.variantId,
            quantity: schema.stockEntries.quantity,
          })
          .from(schema.stockEntries)
          .innerJoin(schema.batchAllocations, eq(schema.batchAllocations.stockEntryId, schema.stockEntries.id))
          .where(inArray(schema.batchAllocations.batchId, batchIds));

  const pushes =
    entries.length === 0
      ? []
      : await db
          .select({
            stockEntryId: schema.shopifyInventoryPushes.stockEntryId,
            delta: schema.shopifyInventoryPushes.delta,
            reason: schema.shopifyInventoryPushes.reason,
            locationId: schema.shopifyInventoryPushes.locationId,
          })
          .from(schema.shopifyInventoryPushes)
          .where(inArray(schema.shopifyInventoryPushes.stockEntryId, entries.map((e) => e.id)));

  const plan = planReceiptDeletion(entries, pushes);
  const own = new Set(plan.entryIds);
  return {
    batchIds,
    plan,
    /** Units the receipt still adds to the stock; they leave with it. */
    quantity: entries.filter((e) => own.has(e.id)).reduce((total, e) => total + e.quantity, 0),
    blockedBy: plan.blockedBy.map((kind) => ENTRY_KIND_LABELS[kind] ?? kind),
  };
}
