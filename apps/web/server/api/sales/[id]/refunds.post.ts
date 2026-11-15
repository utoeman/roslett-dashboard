import { eq } from 'drizzle-orm';
import { H3Error } from 'h3';
import { StockError } from '@roslett/core';
import { schema, useDb } from '../../../db/client.js';
import { createRefundSchema } from '../../../../shared/schemas/sale.js';
import { readId, readJsonBody, requireFound } from '../../../utils/validation.js';
import { badRequest, conflict, databaseError } from '../../../utils/errors.js';
import { numericToCents } from '../../../utils/money.js';
import { insertRefund, lockSale } from '../../../utils/sale-booking.js';
import { loadSales } from '../../../utils/sales.js';

const euro = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;

/**
 * Return, refund without goods or goodwill; the booking lives in sale-booking.
 * The checks run under the sale's lock, so two refunds at once cannot both pass.
 */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const input = await readJsonBody(event, createRefundSchema);
  const db = useDb();

  try {
    await db.transaction(async (tx) => {
      await lockSale(tx, id);
      const sale = requireFound(
        await tx.query.sales.findFirst({ where: eq(schema.sales.id, id), with: { items: true, refunds: true } }),
        'Der Verkauf',
      );
      if (sale.status === 'cancelled') throw conflict('Ein stornierter Verkauf lässt sich nicht erstatten.');
      const item = input.saleItemId === null ? null : sale.items.find((i) => i.id === input.saleItemId);
      if (item === undefined) throw badRequest('Die Position gehört nicht zu diesem Verkauf.', { saleItemId: 'Unbekannt.' });
      if (item !== null && input.quantity > 0) {
        const done = sale.refunds.filter((r) => r.saleItemId === item.id).reduce((total, r) => total + r.quantity, 0);
        if (input.quantity > item.quantity - done) {
          throw badRequest(`Von dieser Position sind noch ${item.quantity - done} Stück offen.`, { quantity: 'Zu viel.' });
        }
      }
      const goods = sale.items.reduce((total, i) => total + i.quantity * (numericToCents(i.unitPriceGross) ?? 0), 0);
      const paid = goods - (numericToCents(sale.discountGross) ?? 0) + (numericToCents(sale.shippingRevenueGross) ?? 0);
      const refunded = sale.refunds.reduce((total, r) => total + (numericToCents(r.amountGross) ?? 0), 0);
      if (input.amountGross > paid - refunded) {
        throw badRequest(`Erstattbar sind höchstens noch ${euro(paid - refunded)}.`, { amountGross: 'Zu hoch.' });
      }
      await insertRefund(tx, sale, item, { ...input, note: input.note ?? null });
    });
  } catch (error) {
    if (error instanceof H3Error) throw error;
    if (error instanceof StockError) throw badRequest(error.message, { quantity: error.message });
    throw databaseError(error, 'Erstattung erfassen');
  }
  setResponseStatus(event, 201);
  const [updated] = await loadSales(db, [id]);
  return requireFound(updated, 'Der Verkauf');
});
