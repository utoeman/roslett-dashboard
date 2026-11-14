import { eq, inArray } from 'drizzle-orm';
import { H3Error } from 'h3';
import { z } from 'zod';
import { schema, useDb } from '../../db/client.js';
import { readId, readJsonBody } from '../../utils/validation.js';
import { badRequest, conflict, databaseError, isForeignKeyViolation, notFound } from '../../utils/errors.js';
import { loadReceiptDeletion } from '../../utils/receipt-deletion.js';
import { takeBackFromShopify } from '../../utils/shopify-inventory.js';
import { syncShopifyOrders } from '../../utils/shopify-sync.js';

type Db = ReturnType<typeof useDb>;

const POSTED = 'Nur Entwürfe lassen sich löschen. Gebuchte Zugänge bitte im Bestandsjournal stornieren.';

const confirmSchema = z.object({ confirm: z.string() });

function assertFree(blockedBy: readonly string[]): void {
  if (blockedBy.length === 0) return;
  throw conflict(
    `Aus diesem Wareneingang gibt es schon weitere Buchungen (${blockedBy.join(', ')}). ` +
      'Löschen ist dann nicht möglich – bitte per Gutschrift oder Storno korrigieren.',
  );
}

/**
 * Removes the receipt with its positions and additional costs, a posted one
 * also with its own postings. Locking the batches makes a parallel sale or
 * booking wait, so the check below sees it.
 */
async function remove(db: Db, id: string, state: 'draft' | 'posted'): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      const [receipt] = await tx
        .select({ state: schema.goodsReceipts.state })
        .from(schema.goodsReceipts)
        .where(eq(schema.goodsReceipts.id, id))
        .for('update');
      if (!receipt) throw notFound('Der Wareneingang');
      if (receipt.state !== state) throw conflict('Der Wareneingang wurde inzwischen geändert. Bitte neu laden.');

      if (state === 'posted') {
        await tx.select({ id: schema.batches.id }).from(schema.batches).where(eq(schema.batches.goodsReceiptId, id)).for('update');
        const { entryIds, blockedBy, shopify } = await loadReceiptDeletion(tx, id);
        assertFree(blockedBy);
        if (shopify.length > 0) throw conflict('Der Zugang wurde inzwischen nach Shopify übertragen. Bitte erneut löschen.');
        if (entryIds.length > 0) {
          await tx.delete(schema.shopifyInventoryPushes).where(inArray(schema.shopifyInventoryPushes.stockEntryId, entryIds));
          await tx.delete(schema.batchAllocations).where(inArray(schema.batchAllocations.stockEntryId, entryIds));
          await tx.delete(schema.stockEntries).where(inArray(schema.stockEntries.id, entryIds));
        }
      }

      await tx.delete(schema.additionalCosts).where(eq(schema.additionalCosts.goodsReceiptId, id));
      await tx.delete(schema.batches).where(eq(schema.batches.goodsReceiptId, id));
      await tx.delete(schema.goodsReceipts).where(eq(schema.goodsReceipts.id, id));
    });
  } catch (error) {
    if (error instanceof H3Error) throw error;
    // A posting that started before the lock references the positions already.
    if (isForeignKeyViolation(error)) throw conflict(state === 'draft' ? POSTED : 'Der Wareneingang wird noch verwendet.');
    throw databaseError(error, 'Wareneingang löschen');
  }
}

const messageOf = (error: unknown) =>
  (error instanceof H3Error && (error.data as { fehler?: string } | undefined)?.fehler) || 'Das Löschen ist fehlgeschlagen.';

/**
 * Deletes a draft (G29) or a posted receipt (G32). A posted one goes only
 * while nothing else uses its batches. What Shopify received is taken back
 * first, in a step of its own that leaves the receipt as "not sent"; the
 * database deletion follows, so a failure in between loses nothing. Numbers
 * come from max()+1.
 */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const db = useDb();

  const current = await db.query.goodsReceipts.findFirst({
    where: eq(schema.goodsReceipts.id, id),
    columns: { state: true, number: true },
  });
  if (!current) throw notFound('Der Wareneingang');
  setResponseStatus(event, 204);
  if (current.state === 'draft') {
    await remove(db, id, 'draft');
    return null;
  }

  const { confirm } = await readJsonBody(event, confirmSchema);
  if (confirm.trim() !== current.number) {
    throw badRequest(`Zum Löschen bitte die Belegnummer ${current.number} eingeben.`, { confirm: 'Belegnummer stimmt nicht.' });
  }

  let deletion = await loadReceiptDeletion(db, id);
  assertFree(deletion.blockedBy);
  if (deletion.shopify.length > 0) {
    // Orders Shopify has but the dashboard not yet may have sold from these batches.
    const sync = await syncShopifyOrders(db, 'manual');
    if (sync.errors.length > 0) {
      throw conflict(
        `Der Shopify-Abruf meldet Fehler (${sync.errors.map((e) => e.order).join(', ')}). ` +
          'Bitte erst klären; solange ist offen, ob aus diesem Wareneingang schon verkauft ist.',
      );
    }
    deletion = await loadReceiptDeletion(db, id);
    assertFree(deletion.blockedBy);
  }

  const taken: { sku: string; delta: number }[] = [];
  try {
    for (const locationId of new Set(deletion.shopify.map((s) => s.locationId))) {
      const here = deletion.shopify.filter((s) => s.locationId === locationId);
      taken.push(...(await takeBackFromShopify(db, current.number, locationId, here)));
    }
    await remove(db, id, 'posted');
  } catch (error) {
    if (taken.length === 0) throw error;
    if (!(error instanceof H3Error)) console.error(error);
    throw conflict(
      `${messageOf(error)} In Shopify ist der Bestand schon abgezogen (${taken.map((t) => `${t.sku} ${t.delta}`).join(', ')}); ` +
        'der Wareneingang gilt dort jetzt als nicht übertragen. Löschen Sie erneut oder übertragen Sie ihn wieder nach Shopify.',
    );
  }
  return null;
});
