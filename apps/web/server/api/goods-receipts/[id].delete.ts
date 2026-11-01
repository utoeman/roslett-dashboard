import { eq } from 'drizzle-orm';
import { H3Error } from 'h3';
import { schema, useDb } from '../../db/client.js';
import { readId } from '../../utils/validation.js';
import { conflict, databaseError, isForeignKeyViolation, notFound } from '../../utils/errors.js';

const POSTED = 'Nur Entwürfe lassen sich löschen. Gebuchte Zugänge bitte im Bestandsjournal stornieren.';

/**
 * Deletes a draft receipt with its positions and additional costs (G29).
 * Posted receipts stay: their entries carry the journal and FIFO; reverse
 * them instead. The row lock keeps a parallel posting from slipping in.
 * Numbers come from max()+1, so deleting the newest draft frees its number.
 */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const db = useDb();

  try {
    await db.transaction(async (tx) => {
      const [receipt] = await tx
        .select({ state: schema.goodsReceipts.state })
        .from(schema.goodsReceipts)
        .where(eq(schema.goodsReceipts.id, id))
        .for('update');
      if (!receipt) throw notFound('Der Wareneingang');
      if (receipt.state !== 'draft') throw conflict(POSTED);

      await tx.delete(schema.additionalCosts).where(eq(schema.additionalCosts.goodsReceiptId, id));
      await tx.delete(schema.batches).where(eq(schema.batches.goodsReceiptId, id));
      await tx.delete(schema.goodsReceipts).where(eq(schema.goodsReceipts.id, id));
    });
  } catch (error) {
    if (error instanceof H3Error) throw error;
    // A posting that started before the lock references the positions already.
    if (isForeignKeyViolation(error)) throw conflict(POSTED);
    throw databaseError(error, 'Wareneingang löschen');
  }
  setResponseStatus(event, 204);
  return null;
});
