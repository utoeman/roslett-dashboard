import { and, eq, like, sql } from 'drizzle-orm';
import { receiptNumber, receiptPrefix } from '@roslett/core';
import { schema, useDb } from '../../db/client.js';
import { createReceiptSchema } from '../../../shared/schemas/goods-receipt.js';
import { readJsonBody, requireFound } from '../../utils/validation.js';
import { badRequest, databaseError } from '../../utils/errors.js';
import { fetchEcbRate } from '../../utils/ecb.js';
import { assertVariants, loadReceipt, positionRows } from '../../utils/stock.js';

/** Creates a draft receipt; the number is WE- or PR-<invoice year>-<sequence>. */
export default defineEventHandler(async (event) => {
  const input = await readJsonBody(event, createReceiptSchema);
  const db = useDb();

  const supplier = await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, input.supplierId) });
  if (supplier === undefined || supplier.archivedAt !== null) {
    throw badRequest('Den Lieferanten gibt es nicht oder er ist archiviert.', { supplierId: 'Nicht verfügbar.' });
  }
  await assertVariants(db, input.positions);

  const currency = input.currency ?? supplier.defaultCurrency;
  const { rate, source } =
    input.exchangeRate !== undefined
      ? { rate: input.exchangeRate, source: 'manual' as const }
      : { rate: (await fetchEcbRate(currency, input.invoiceDate)).rate, source: 'ecb' as const };

  try {
    const receipt = await db.transaction(async (tx) => {
      const year = Number(input.invoiceDate.slice(0, 4));
      const [last] = await tx
        .select({ max: sql<number>`coalesce(max(substring(${schema.goodsReceipts.number} from 9)::int), 0)::int` })
        .from(schema.goodsReceipts)
        .where(and(like(schema.goodsReceipts.number, `${receiptPrefix(input.kind)}-${year}-%`)));

      const [created] = await tx
        .insert(schema.goodsReceipts)
        .values({
          kind: input.kind,
          number: receiptNumber(year, (last?.max ?? 0) + 1, input.kind),
          supplierId: supplier.id,
          invoiceNumber: input.invoiceNumber ?? null,
          invoiceDate: input.invoiceDate,
          currency,
          exchangeRate: rate.toFixed(6),
          exchangeRateSource: source,
        })
        .returning({ id: schema.goodsReceipts.id });
      const saved = requireFound(created, 'Der Wareneingang');

      if (input.positions.length > 0) {
        await tx.insert(schema.batches).values(positionRows(saved.id, input.positions, rate));
      }
      return requireFound(await loadReceipt(tx, saved.id), 'Der Wareneingang');
    });
    setResponseStatus(event, 201);
    return receipt;
  } catch (error) {
    throw databaseError(error, 'Wareneingang anlegen');
  }
});
