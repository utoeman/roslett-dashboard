/**
 * Deleting a posted goods receipt (G32): loads the journal entries on its
 * batches and plans what goes and what Shopify gets back.
 */

import { eq, inArray } from 'drizzle-orm';
import { planReceiptDeletion } from '@roslett/core';
import { schema } from '../db/client.js';
import { STOCK_ENTRY_KIND_LABELS } from '../../shared/stock-entry-kinds.js';
import type { StockEntryKind } from '../../shared/types/api.js';
import type { Reader, TakeBack } from './shopify-inventory.js';

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
            id: schema.shopifyInventoryPushes.id,
            stockEntryId: schema.shopifyInventoryPushes.stockEntryId,
            delta: schema.shopifyInventoryPushes.delta,
            reason: schema.shopifyInventoryPushes.reason,
            locationId: schema.shopifyInventoryPushes.locationId,
          })
          .from(schema.shopifyInventoryPushes)
          .where(inArray(schema.shopifyInventoryPushes.stockEntryId, entries.map((e) => e.id)));

  const plan = planReceiptDeletion(entries, pushes);
  const variants =
    plan.shopify.length === 0
      ? []
      : await db.query.variants.findMany({
          where: inArray(schema.variants.id, [...new Set(plan.shopify.map((s) => s.variantId))]),
          columns: { id: true, sku: true, shopifyInventoryItemId: true },
        });

  // Without the link there is nothing to adjust in Shopify; the receipt goes all the same.
  const shopify: TakeBack[] = [];
  const unlinked = new Set<string>();
  for (const { variantId, ...change } of plan.shopify) {
    const variant = variants.find((v) => v.id === variantId);
    if (variant?.shopifyInventoryItemId) {
      shopify.push({ ...change, sku: variant.sku, inventoryItemId: variant.shopifyInventoryItemId });
    } else {
      unlinked.add(variant?.sku ?? variantId);
    }
  }

  return {
    positions: batchIds.length,
    entryIds: plan.entryIds,
    quantity: plan.quantity,
    blockedBy: plan.blockedBy.map((kind) => STOCK_ENTRY_KIND_LABELS[kind as StockEntryKind] ?? kind),
    shopify,
    unlinked: [...unlinked],
  };
}
