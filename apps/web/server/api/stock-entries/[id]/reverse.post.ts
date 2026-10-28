import { eq } from 'drizzle-orm';
import { schema, useDb } from '../../../db/client.js';
import { reverseSchema } from '../../../../shared/schemas/stock-entry.js';
import { readJsonBody, readId, requireFound } from '../../../utils/validation.js';
import { conflict, databaseError } from '../../../utils/errors.js';
import { reverseEntry } from '../../../utils/stock.js';

/**
 * Reverses a journal entry. Entries of a sale are excluded: cancelling or
 * returning goes through the sale, so order and stock stay in step (F14).
 */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const { note } = await readJsonBody(event, reverseSchema);
  const db = useDb();

  const original = requireFound(
    await db.query.stockEntries.findFirst({ where: eq(schema.stockEntries.id, id), with: { allocations: true } }),
    'Die Buchung',
  );
  if (original.kind === 'reversal') throw conflict('Ein Storno lässt sich nicht stornieren.');
  if (original.saleItemId !== null) {
    throw conflict('Buchungen eines Verkaufs werden über den Verkauf storniert oder retourniert.');
  }
  const already = await db.query.stockEntries.findFirst({
    where: eq(schema.stockEntries.reversesId, id),
    columns: { id: true },
  });
  if (already) throw conflict('Diese Buchung ist bereits storniert.');

  try {
    const reversalId = await db.transaction((tx) => reverseEntry(tx, original, note ?? null));
    setResponseStatus(event, 201);
    return { id: reversalId };
  } catch (error) {
    throw databaseError(error, 'Buchung stornieren');
  }
});
