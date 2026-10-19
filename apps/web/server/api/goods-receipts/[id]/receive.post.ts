import { eq } from 'drizzle-orm';
import { schema, useDb } from '../../../db/client.js';
import { receiveSchema } from '../../../../shared/schemas/goods-receipt.js';
import { readJsonBody, readId, requireFound } from '../../../utils/validation.js';
import { badRequest, databaseError } from '../../../utils/errors.js';
import { loadReceipt, postEntry, resolveShortfalls } from '../../../utils/stock.js';

/**
 * Books delivered quantities as receipts (partial deliveries allowed, more than
 * ordered too). Posts the receipt and then resolves open shortfalls.
 */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const input = await readJsonBody(event, receiveSchema);
  const db = useDb();

  const receipt = requireFound(
    await db.query.goodsReceipts.findFirst({ where: eq(schema.goodsReceipts.id, id), with: { batches: true } }),
    'Der Wareneingang',
  );
  const batches = new Map(receipt.batches.map((b) => [b.id, b]));
  input.lines.forEach((line, index) => {
    if (!batches.has(line.batchId)) {
      throw badRequest('Die Position gehört nicht zu diesem Wareneingang.', { [`lines.${index}.batchId`]: 'Unbekannt.' });
    }
  });

  try {
    return await db.transaction(async (tx) => {
      const variants = new Set<string>();
      for (const line of input.lines) {
        const batch = batches.get(line.batchId);
        if (batch === undefined) continue;
        await postEntry(tx, {
          variantId: batch.variantId,
          kind: 'goods_receipt',
          quantity: line.quantity,
          postedAt: input.postedAt,
          note: receipt.number,
          allocations: [{ batchId: batch.id, quantity: line.quantity }],
        });
        variants.add(batch.variantId);
      }
      await tx.update(schema.goodsReceipts).set({ state: 'posted' }).where(eq(schema.goodsReceipts.id, id));
      for (const variantId of variants) await resolveShortfalls(tx, variantId);
      return requireFound(await loadReceipt(tx, id), 'Der Wareneingang');
    });
  } catch (error) {
    throw databaseError(error, 'Zugang buchen');
  }
});
