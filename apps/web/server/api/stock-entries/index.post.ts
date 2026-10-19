import { eq } from 'drizzle-orm';
import { StockError, planIssue, planStocktake, type PlannedAllocation } from '@trd/core';
import { schema, useDb } from '../../db/client.js';
import { manualEntrySchema } from '../../../shared/schemas/stock-entry.js';
import { readJsonBody, requireFound } from '../../utils/validation.js';
import { badRequest, databaseError } from '../../utils/errors.js';
import { batchStock, currentStock, postEntry, resolveShortfalls } from '../../utils/stock.js';

/**
 * Manual entries: shrinkage and own use (FIFO), stocktake (surplus to the newest
 * batch, deficit FIFO) and return to supplier (a specific batch).
 */
export default defineEventHandler(async (event) => {
  const input = await readJsonBody(event, manualEntrySchema);
  const db = useDb();

  requireFound(
    await db.query.variants.findFirst({ where: eq(schema.variants.id, input.variantId), columns: { id: true } }),
    'Die Variante',
  );

  try {
    const id = await db.transaction(async (tx) => {
      const stock = await batchStock(tx, input.variantId);
      let quantity: number;
      let allocations: PlannedAllocation[];

      if (input.kind === 'stocktake') {
        quantity = input.counted - (await currentStock(tx, input.variantId));
        if (quantity === 0) throw badRequest('Der gezählte Bestand stimmt bereits.', { counted: 'Keine Abweichung.' });
        allocations = planStocktake(stock, quantity);
      } else if (input.kind === 'supplier_return') {
        const batch = stock.find((b) => b.id === input.batchId);
        if (batch === undefined) {
          throw badRequest('Die Charge gehört nicht zu dieser Variante.', { batchId: 'Unbekannt.' });
        }
        if (batch.remaining < input.quantity) {
          throw badRequest(`Aus dieser Charge sind nur noch ${batch.remaining} Stück da.`, { quantity: 'Zu viel.' });
        }
        quantity = -input.quantity;
        allocations = [{ batchId: batch.id, quantity }];
      } else {
        quantity = -input.quantity;
        allocations = planIssue(stock, input.quantity);
      }

      const entryId = await postEntry(tx, {
        variantId: input.variantId,
        kind: input.kind,
        quantity,
        postedAt: input.postedAt,
        note: input.note ?? null,
        allocations,
      });
      if (quantity > 0) await resolveShortfalls(tx, input.variantId);
      return entryId;
    });
    setResponseStatus(event, 201);
    return { id };
  } catch (error) {
    if (error instanceof StockError) throw badRequest(error.message);
    throw databaseError(error, 'Buchung erfassen');
  }
});
