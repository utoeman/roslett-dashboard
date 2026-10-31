import { eq } from 'drizzle-orm';
import { schema, useDb } from '../../../db/client.js';
import { cancelSaleSchema } from '../../../../shared/schemas/sale.js';
import { readId, readJsonBody, requireFound } from '../../../utils/validation.js';
import { conflict, databaseError } from '../../../utils/errors.js';
import { cancelSale } from '../../../utils/sale-booking.js';
import { loadSales } from '../../../utils/sales.js';

/**
 * Cancels an open order as a whole: every `sale` entry gets its reversal and
 * the status becomes `cancelled` (F10). Fees stay (F11).
 */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const { note } = await readJsonBody(event, cancelSaleSchema);
  const db = useDb();

  const sale = requireFound(
    await db.query.sales.findFirst({
      where: eq(schema.sales.id, id),
      with: { items: { columns: { id: true } }, refunds: { columns: { id: true } } },
    }),
    'Der Verkauf',
  );
  if (sale.status !== 'open') {
    throw conflict('Nur offene Bestellungen lassen sich stornieren; nach dem Versand bitte Retoure oder Erstattung erfassen.');
  }
  if (sale.refunds.length > 0) {
    throw conflict('Zu dieser Bestellung gibt es schon Erstattungen; ein Storno ist nicht mehr möglich.');
  }

  try {
    await db.transaction((tx) =>
      cancelSale(tx, { id, externalOrderNumber: sale.externalOrderNumber, itemIds: sale.items.map((i) => i.id) }, note ?? null),
    );
  } catch (error) {
    throw databaseError(error, 'Verkauf stornieren');
  }

  const [updated] = await loadSales(db, [id]);
  return requireFound(updated, 'Der Verkauf');
});
