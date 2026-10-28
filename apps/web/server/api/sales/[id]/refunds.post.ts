import { and, desc, eq, isNull } from 'drizzle-orm';
import { StockError, planIssue, planReturn } from '@roslett/core';
import { schema, useDb } from '../../../db/client.js';
import { createRefundSchema } from '../../../../shared/schemas/sale.js';
import { readId, readJsonBody, requireFound } from '../../../utils/validation.js';
import { badRequest, conflict, databaseError } from '../../../utils/errors.js';
import { centsToNumeric, numericToCents } from '../../../utils/money.js';
import { batchStock, postEntry, resolveShortfalls, returnSources, type Tx } from '../../../utils/stock.js';
import { loadSales } from '../../../utils/sales.js';

const euro = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;

/** Closes `quantity` units of the line's open shortfall; the sale entries keep their sums (split rows). */
async function closeOpenShortfall(tx: Tx, saleItemId: string, quantity: number, now: Date): Promise<void> {
  const open = await tx
    .select({ id: schema.batchAllocations.id, stockEntryId: schema.batchAllocations.stockEntryId, quantity: schema.batchAllocations.quantity })
    .from(schema.batchAllocations)
    .innerJoin(schema.stockEntries, eq(schema.batchAllocations.stockEntryId, schema.stockEntries.id))
    .where(
      and(
        eq(schema.stockEntries.saleItemId, saleItemId),
        eq(schema.stockEntries.kind, 'sale'),
        isNull(schema.batchAllocations.batchId),
        isNull(schema.batchAllocations.resolvedAt),
      ),
    )
    .orderBy(desc(schema.stockEntries.postedAt));
  let rest = quantity;
  for (const row of open) {
    if (rest === 0) break;
    const taken = Math.min(-row.quantity, rest);
    if (taken === -row.quantity) {
      await tx.update(schema.batchAllocations).set({ resolvedAt: now }).where(eq(schema.batchAllocations.id, row.id));
    } else {
      await tx.update(schema.batchAllocations).set({ quantity: row.quantity + taken }).where(eq(schema.batchAllocations.id, row.id));
      await tx.insert(schema.batchAllocations).values({ stockEntryId: row.stockEntryId, batchId: null, quantity: -taken, resolvedAt: now });
    }
    rest -= taken;
  }
}

/**
 * Return, refund without goods or goodwill. A return puts the goods back where
 * the line came from (F13); damaged goods are written off right away (F12).
 */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const input = await readJsonBody(event, createRefundSchema);
  const db = useDb();

  const sale = requireFound(
    await db.query.sales.findFirst({ where: eq(schema.sales.id, id), with: { items: true, refunds: true } }),
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

  try {
    await db.transaction(async (tx) => {
      if (input.restocked && item !== null) {
        const plan = planReturn(await returnSources(tx, item.id), input.quantity);
        const now = new Date();
        if (plan.closedShortfall > 0) await closeOpenShortfall(tx, item.id, plan.closedShortfall, now);
        await postEntry(tx, {
          variantId: item.variantId,
          kind: 'return',
          quantity: input.quantity,
          postedAt: input.refundedAt,
          note: input.note ?? null,
          saleItemId: item.id,
          allocations: [
            ...plan.toBatches,
            ...(plan.closedShortfall > 0 ? [{ batchId: null, quantity: plan.closedShortfall, resolvedAt: now }] : []),
          ],
        });
        if (input.damaged) {
          await postEntry(tx, {
            variantId: item.variantId,
            kind: 'shrinkage',
            quantity: -input.quantity,
            postedAt: input.refundedAt,
            note: `Retoure beschädigt (${sale.externalOrderNumber})`,
            saleItemId: item.id,
            allocations: planIssue(await batchStock(tx, item.variantId), input.quantity),
          });
        } else if (plan.toBatches.length > 0) {
          await resolveShortfalls(tx, item.variantId);
        }
      }

      await tx.insert(schema.refunds).values({
        saleId: sale.id,
        saleItemId: item?.id ?? null,
        quantity: input.quantity,
        amountGross: centsToNumeric(input.amountGross) ?? '0',
        restocked: input.restocked,
        damaged: input.damaged,
        refundedAt: new Date(`${input.refundedAt}T12:00:00Z`),
        note: input.note ?? null,
      });
    });
  } catch (error) {
    if (error instanceof StockError) throw badRequest(error.message, { quantity: error.message });
    throw databaseError(error, 'Erstattung erfassen');
  }

  setResponseStatus(event, 201);
  const [updated] = await loadSales(db, [id]);
  return requireFound(updated, 'Der Verkauf');
});
