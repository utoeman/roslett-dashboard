import { eq } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { updateReceiptSchema } from '../../../shared/schemas/goods-receipt.js';
import { readJsonBody, readId, requireFound } from '../../utils/validation.js';
import { conflict, databaseError } from '../../utils/errors.js';
import { fetchEcbRate } from '../../utils/ecb.js';
import { assertVariants, loadReceipt, positionRows } from '../../utils/stock.js';

/**
 * Edits a draft. Positions are replaced as a whole (drafts have no bookings);
 * EUR prices are recalculated whenever the rate changes.
 */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const input = await readJsonBody(event, updateReceiptSchema);
  const db = useDb();

  const receipt = requireFound(
    await db.query.goodsReceipts.findFirst({
      where: eq(schema.goodsReceipts.id, id),
      with: { batches: true },
    }),
    'Der Wareneingang',
  );
  if (receipt.state !== 'draft') {
    throw conflict('Ein gebuchter Wareneingang lässt sich nicht mehr ändern. Nebenkosten können weiter erfasst werden.');
  }
  if (input.positions) await assertVariants(db, input.positions);

  const invoiceDate = input.invoiceDate ?? receipt.invoiceDate;
  const currency = input.currency ?? receipt.currency;
  let rate = Number(receipt.exchangeRate);
  let source = receipt.exchangeRateSource;
  if (typeof input.exchangeRate === 'number') {
    rate = input.exchangeRate;
    source = 'manual';
  } else if (
    input.exchangeRate === null ||
    (source === 'ecb' && (invoiceDate !== receipt.invoiceDate || currency !== receipt.currency))
  ) {
    rate = (await fetchEcbRate(currency, invoiceDate)).rate;
    source = 'ecb';
  }
  const rateChanged = rate !== Number(receipt.exchangeRate);

  try {
    return await db.transaction(async (tx) => {
      await tx
        .update(schema.goodsReceipts)
        .set({
          ...(input.invoiceNumber !== undefined ? { invoiceNumber: input.invoiceNumber } : {}),
          invoiceDate,
          currency,
          exchangeRate: rate.toFixed(6),
          exchangeRateSource: source,
        })
        .where(eq(schema.goodsReceipts.id, id));

      const positions =
        input.positions ??
        (rateChanged
          ? receipt.batches.map((b) => ({
              variantId: b.variantId,
              quantityOrdered: b.quantityOrdered,
              unitPrice: b.unitPriceForeign,
              note: b.note,
            }))
          : undefined);
      if (positions !== undefined) {
        await tx.delete(schema.batches).where(eq(schema.batches.goodsReceiptId, id));
        if (positions.length > 0) await tx.insert(schema.batches).values(positionRows(id, positions, rate));
      }
      return requireFound(await loadReceipt(tx, id), 'Der Wareneingang');
    });
  } catch (error) {
    throw databaseError(error, 'Wareneingang ändern');
  }
});
