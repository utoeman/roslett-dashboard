import { eq } from 'drizzle-orm';
import { schema, useDb } from '../../../db/client.js';
import { additionalCostSchema } from '../../../../shared/schemas/goods-receipt.js';
import { readJsonBody, readId, requireFound } from '../../../utils/validation.js';
import { centsToNumeric } from '../../../utils/money.js';
import { loadReceipt } from '../../../utils/stock.js';

/**
 * Adds freight, duty, other costs or a credit, also after posting. Landed cost
 * is computed, so it changes retroactively for every unit of the receipt.
 */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const input = await readJsonBody(event, additionalCostSchema);
  const db = useDb();

  requireFound(
    await db.query.goodsReceipts.findFirst({ where: eq(schema.goodsReceipts.id, id), columns: { id: true } }),
    'Der Wareneingang',
  );

  await db.insert(schema.additionalCosts).values({
    goodsReceiptId: id,
    kind: input.kind,
    amountEur: centsToNumeric(input.kind === 'credit' ? -input.amount : input.amount) ?? '0',
    distributionMethod: input.distributionMethod,
    incurredOn: input.incurredOn ?? new Date().toISOString().slice(0, 10),
    note: input.note ?? null,
  });
  setResponseStatus(event, 201);
  return requireFound(await loadReceipt(db, id), 'Der Wareneingang');
});
