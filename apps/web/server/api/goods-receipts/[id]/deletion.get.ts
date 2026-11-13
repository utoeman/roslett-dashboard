import { eq, inArray, sql } from 'drizzle-orm';
import { schema, useDb } from '../../../db/client.js';
import type { ReceiptDeletionPreview } from '../../../../shared/types/api.js';
import { readId, requireFound } from '../../../utils/validation.js';
import { loadReceiptDeletion } from '../../../utils/receipt-deletion.js';

/** What deleting a posted receipt would remove, and whether it is allowed (G32). */
export default defineEventHandler(async (event): Promise<ReceiptDeletionPreview> => {
  const id = readId(event);
  const db = useDb();
  const receipt = requireFound(
    await db.query.goodsReceipts.findFirst({
      where: eq(schema.goodsReceipts.id, id),
      columns: { number: true },
    }),
    'Der Wareneingang',
  );

  const { batchIds, plan, quantity, blockedBy } = await loadReceiptDeletion(db, id);
  const [{ costs } = { costs: 0 }] = await db
    .select({ costs: sql<number>`count(*)::int` })
    .from(schema.additionalCosts)
    .where(eq(schema.additionalCosts.goodsReceiptId, id));

  const skus =
    plan.shopify.length === 0
      ? new Map<string, string>()
      : new Map(
          (
            await db.query.variants.findMany({
              where: inArray(schema.variants.id, plan.shopify.map((s) => s.variantId)),
              columns: { id: true, sku: true },
            })
          ).map((v) => [v.id, v.sku]),
        );

  return {
    number: receipt.number,
    positions: batchIds.length,
    quantity,
    additionalCosts: costs,
    blockedBy,
    shopify: plan.shopify.map((s) => ({ sku: skus.get(s.variantId) ?? s.variantId, delta: s.delta })),
  };
});
