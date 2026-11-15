import { eq } from 'drizzle-orm';
import { H3Error } from 'h3';
import { schema, useDb } from '../../../db/client.js';
import { cancelSaleSchema } from '../../../../shared/schemas/sale.js';
import { readId, readJsonBody, requireFound } from '../../../utils/validation.js';
import { conflict, databaseError } from '../../../utils/errors.js';
import { cancelSale, lockSale } from '../../../utils/sale-booking.js';
import { loadSales } from '../../../utils/sales.js';

/**
 * Cancels an open order as a whole: every `sale` entry gets its reversal and
 * the status becomes `cancelled` (F10). Fees stay (F11). Checked under the
 * sale's lock, so a parallel refund or second cancel is seen.
 */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const { note } = await readJsonBody(event, cancelSaleSchema);
  const db = useDb();

  try {
    await db.transaction(async (tx) => {
      await lockSale(tx, id);
      const sale = requireFound(
        await tx.query.sales.findFirst({
          where: eq(schema.sales.id, id),
          with: { items: { columns: { id: true } }, refunds: { columns: { id: true } } },
        }),
        'Der Verkauf',
      );
      if (sale.status === 'cancelled') throw conflict('Diese Bestellung ist bereits storniert.');
      if (sale.status !== 'open') {
        throw conflict('Nur offene Bestellungen lassen sich stornieren; nach dem Versand bitte Retoure oder Erstattung erfassen.');
      }
      if (sale.refunds.length > 0) {
        throw conflict('Zu dieser Bestellung gibt es schon Erstattungen; ein Storno ist nicht mehr möglich.');
      }
      await cancelSale(tx, { id, externalOrderNumber: sale.externalOrderNumber, itemIds: sale.items.map((i) => i.id) }, note ?? null);
    });
  } catch (error) {
    if (error instanceof H3Error) throw error;
    throw databaseError(error, 'Verkauf stornieren');
  }
  const [updated] = await loadSales(db, [id]);
  return requireFound(updated, 'Der Verkauf');
});
