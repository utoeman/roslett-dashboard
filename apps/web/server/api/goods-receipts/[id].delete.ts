import { eq, inArray } from 'drizzle-orm';
import { H3Error } from 'h3';
import { z } from 'zod';
import { schema, useDb } from '../../db/client.js';
import { readId, readJsonBody } from '../../utils/validation.js';
import { badRequest, conflict, databaseError, isForeignKeyViolation, notFound } from '../../utils/errors.js';
import { loadReceiptDeletion } from '../../utils/receipt-deletion.js';
import { takeBackFromShopify } from '../../utils/shopify-inventory.js';

const POSTED = 'Nur Entwürfe lassen sich löschen. Gebuchte Zugänge bitte im Bestandsjournal stornieren.';

const confirmSchema = z.object({ confirm: z.string() });

/**
 * Deletes a draft (G29) or a posted receipt (G32) with its positions and
 * additional costs. A posted receipt also takes its own postings and their
 * reversals, and only while nothing else uses its batches; what Shopify
 * received is taken back in the same transaction. The row lock keeps a
 * parallel posting or sale from slipping in. Numbers come from max()+1.
 */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const db = useDb();

  const current = await db.query.goodsReceipts.findFirst({
    where: eq(schema.goodsReceipts.id, id),
    columns: { state: true, number: true },
  });
  if (!current) throw notFound('Der Wareneingang');
  if (current.state === 'posted') {
    const { confirm } = await readJsonBody(event, confirmSchema);
    if (confirm.trim() !== current.number) {
      throw badRequest(`Zum Löschen bitte die Belegnummer ${current.number} eingeben.`, { confirm: 'Belegnummer stimmt nicht.' });
    }
  }

  try {
    await db.transaction(async (tx) => {
      const [receipt] = await tx
        .select({ id: schema.goodsReceipts.id, number: schema.goodsReceipts.number, state: schema.goodsReceipts.state })
        .from(schema.goodsReceipts)
        .where(eq(schema.goodsReceipts.id, id))
        .for('update');
      if (!receipt) throw notFound('Der Wareneingang');
      if (receipt.state !== current.state) throw conflict('Der Wareneingang wurde inzwischen geändert. Bitte neu laden.');

      if (receipt.state === 'posted') {
        const { plan, blockedBy } = await loadReceiptDeletion(tx, id);
        if (blockedBy.length > 0) {
          throw conflict(
            `Aus diesem Wareneingang gibt es schon weitere Buchungen (${blockedBy.join(', ')}). ` +
              'Löschen ist dann nicht möglich – bitte per Gutschrift oder Storno korrigieren.',
          );
        }
        // Shopify first: if it refuses, the transaction rolls back and nothing is deleted.
        await takeBackFromShopify(tx, receipt, plan.shopify);
        if (plan.entryIds.length > 0) {
          await tx.delete(schema.shopifyInventoryPushes).where(inArray(schema.shopifyInventoryPushes.stockEntryId, plan.entryIds));
          await tx.delete(schema.batchAllocations).where(inArray(schema.batchAllocations.stockEntryId, plan.entryIds));
          await tx.delete(schema.stockEntries).where(inArray(schema.stockEntries.id, plan.entryIds));
        }
      }

      await tx.delete(schema.additionalCosts).where(eq(schema.additionalCosts.goodsReceiptId, id));
      await tx.delete(schema.batches).where(eq(schema.batches.goodsReceiptId, id));
      await tx.delete(schema.goodsReceipts).where(eq(schema.goodsReceipts.id, id));
    });
  } catch (error) {
    if (error instanceof H3Error) throw error;
    // A posting that started before the lock references the positions already.
    if (isForeignKeyViolation(error)) throw conflict(current.state === 'draft' ? POSTED : 'Der Wareneingang wird noch verwendet.');
    throw databaseError(error, 'Wareneingang löschen');
  }
  setResponseStatus(event, 204);
  return null;
});
