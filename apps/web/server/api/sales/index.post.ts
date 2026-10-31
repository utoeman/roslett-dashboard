import { and, eq } from 'drizzle-orm';
import { SalesError, StockError } from '@roslett/core';
import { schema, useDb } from '../../db/client.js';
import { createSaleSchema } from '../../../shared/schemas/sale.js';
import { readJsonBody } from '../../utils/validation.js';
import { badRequest, conflict, databaseError, isUniqueViolation } from '../../utils/errors.js';
import { insertSale, prepareSale } from '../../utils/sale-booking.js';

/**
 * Manual sale: one `sale` entry per line, issued FIFO; missing stock is booked
 * as a shortfall with a warning (E8). Shipping, postage and the flat fee
 * default from the channel.
 */
export default defineEventHandler(async (event) => {
  const input = await readJsonBody(event, createSaleSchema);
  const db = useDb();

  const channel = await db.query.channels.findFirst({ where: eq(schema.channels.id, input.channelId) });
  if (channel === undefined || !channel.active) {
    throw badRequest('Den Kanal gibt es nicht oder er ist inaktiv.', { channelId: 'Kanal nicht verfügbar.' });
  }
  const duplicate = await db.query.sales.findFirst({
    where: and(
      eq(schema.sales.channelId, input.channelId),
      eq(schema.sales.externalOrderNumber, input.externalOrderNumber),
    ),
    columns: { id: true },
  });
  if (duplicate) {
    throw conflict('Diese Bestellnummer ist für den Kanal schon erfasst.', { externalOrderNumber: 'Gibt es schon.' });
  }

  const prepared = await prepareSale(db, { ...input, channel });

  try {
    const result = await db.transaction((tx) => insertSale(tx, prepared));
    setResponseStatus(event, 201);
    return result;
  } catch (error) {
    if (error instanceof StockError || error instanceof SalesError) throw badRequest(error.message);
    if (isUniqueViolation(error)) {
      throw conflict('Diese Bestellnummer ist für den Kanal schon erfasst.', { externalOrderNumber: 'Gibt es schon.' });
    }
    throw databaseError(error, 'Verkauf erfassen');
  }
});
