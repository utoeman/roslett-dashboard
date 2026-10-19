import { eq } from 'drizzle-orm';
import { schema, useDb } from '../../../db/client.js';
import { reverseSchema } from '../../../../shared/schemas/stock-entry.js';
import { readJsonBody, readId, requireFound } from '../../../utils/validation.js';
import { conflict, databaseError } from '../../../utils/errors.js';
import { batchStock, postEntry, resolveShortfalls } from '../../../utils/stock.js';

/**
 * Reverses an entry with a counter entry; the original stays untouched. Batch
 * allocations are mirrored, an open shortfall is closed. Stock that has been
 * used up since cannot be taken back.
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
  const already = await db.query.stockEntries.findFirst({
    where: eq(schema.stockEntries.reversesId, id),
    columns: { id: true },
  });
  if (already) throw conflict('Diese Buchung ist bereits storniert.');

  try {
    const reversalId = await db.transaction(async (tx) => {
      const stock = new Map((await batchStock(tx, original.variantId)).map((b) => [b.id, b.remaining]));
      const now = new Date();
      const allocations = original.allocations.map((a) => {
        if (a.batchId !== null && -a.quantity < 0 && (stock.get(a.batchId) ?? 0) < a.quantity) {
          throw conflict('Ware aus dieser Buchung ist inzwischen verbraucht; ein Storno ist nicht mehr möglich.');
        }
        return { batchId: a.batchId, quantity: -a.quantity, resolvedAt: a.batchId === null ? now : undefined };
      });

      // An unresolved shortfall of the original is closed, not resolved later.
      for (const a of original.allocations) {
        if (a.batchId === null && a.resolvedAt === null) {
          await tx.update(schema.batchAllocations).set({ resolvedAt: now }).where(eq(schema.batchAllocations.id, a.id));
        }
      }

      const created = await postEntry(tx, {
        variantId: original.variantId,
        kind: 'reversal',
        quantity: -original.quantity,
        note: note ?? null,
        reversesId: original.id,
        allocations,
      });
      if (-original.quantity > 0) await resolveShortfalls(tx, original.variantId);
      return created;
    });
    setResponseStatus(event, 201);
    return { id: reversalId };
  } catch (error) {
    throw databaseError(error, 'Buchung stornieren');
  }
});
