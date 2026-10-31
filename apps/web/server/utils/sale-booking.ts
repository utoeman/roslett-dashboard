/**
 * Booking of sales, cancellations and refunds, shared by the manual routes and
 * the Shopify import so both post the same journal entries.
 */

import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
  flatFee,
  orderTotalGross,
  planIssue,
  planReturn,
  shippingRevenueFor,
  type Cents,
  type SaleLine,
} from '@roslett/core';
import { schema, type useDb } from '../db/client.js';
import { badRequest } from './errors.js';
import { centsToNumeric, numericToCents, numericToRate, rateToNumeric } from './money.js';
import { vatRateFor } from './sales.js';
import { batchStock, postEntry, resolveShortfalls, returnSources, reverseEntry, type Tx } from './stock.js';

type Reader = Pick<ReturnType<typeof useDb>, 'select' | 'query'>;
type ChannelRow = typeof schema.channels.$inferSelect;

export interface SaleDraft {
  /** Null only for imported orders from an unknown source (B9). */
  channel: ChannelRow | null;
  externalOrderNumber: string;
  orderedAt: string;
  deliveryCountry: string;
  /** Without a value the channel's shipping price and free-shipping threshold apply. */
  shippingRevenueGross?: Cents;
  /** Without a value the channel's default postage applies. */
  postageCost?: Cents;
  discountGross: Cents;
  items: readonly { variantId: string; quantity: number; unitPriceGross: Cents; shopifyLineItemId?: string }[];
  status?: 'open' | 'shipped';
  shopifyOrderId?: string;
}

type PreparedLine = SaleLine & { variantId: string; sku: string; shopifyLineItemId?: string };

export interface PreparedSale {
  draft: SaleDraft;
  lines: PreparedLine[];
  shippingRevenueGross: Cents;
  postageCost: Cents;
  fee: Cents;
}

/** Checks variants and VAT and fills the channel defaults; throws 400 with field paths. */
export async function prepareSale(db: Reader, draft: SaleDraft): Promise<PreparedSale> {
  const variants = await db.query.variants.findMany({
    where: inArray(schema.variants.id, [...new Set(draft.items.map((i) => i.variantId))]),
    columns: { id: true, sku: true, archivedAt: true },
    with: { product: { columns: { vatCategory: true } } },
  });

  const lines: PreparedLine[] = [];
  for (const [index, item] of draft.items.entries()) {
    const variant = variants.find((v) => v.id === item.variantId);
    if (variant === undefined || variant.archivedAt !== null) {
      throw badRequest('Eine Variante gibt es nicht oder sie ist archiviert.', {
        [`items.${index}.variantId`]: 'Variante nicht verfügbar.',
      });
    }
    const vatRate = await vatRateFor(db, draft.deliveryCountry, variant.product.vatCategory, draft.orderedAt);
    if (vatRate === null) {
      throw badRequest(`Für ${draft.deliveryCountry} ist kein MwSt-Satz hinterlegt.`, {
        deliveryCountry: 'Kein MwSt-Satz hinterlegt.',
      });
    }
    lines.push({ ...item, id: String(index), sku: variant.sku, vatRate, costOfGoodsEur: 0, unitCostItemsEur: 0 });
  }

  const goodsGross = lines.reduce((total, l) => total + l.quantity * l.unitPriceGross, 0);
  if (draft.discountGross > goodsGross) {
    throw badRequest('Der Rabatt ist höher als der Warenwert.', { discountGross: 'Zu hoch.' });
  }
  const { channel } = draft;
  const shippingRevenueGross =
    draft.shippingRevenueGross ??
    (channel === null
      ? 0
      : shippingRevenueFor(
          {
            shippingPriceGross: numericToCents(channel.shippingPriceGross) ?? 0,
            freeShippingFrom: numericToCents(channel.freeShippingFrom),
          },
          goodsGross,
        ));
  const postageCost = draft.postageCost ?? (channel === null ? 0 : (numericToCents(channel.defaultPostage) ?? 0));
  const fee =
    channel === null
      ? 0
      : flatFee(
          { feePercent: numericToRate(channel.feePercent) ?? 0, feeFixed: numericToCents(channel.feeFixed) ?? 0 },
          orderTotalGross(lines, draft.discountGross, shippingRevenueGross),
        );
  return { draft, lines, shippingRevenueGross, postageCost, fee };
}

/**
 * One `sale` entry per line, issued FIFO; missing stock is booked as a
 * shortfall with a warning (E8).
 */
export async function insertSale(tx: Tx, prepared: PreparedSale): Promise<{ id: string; warnings: string[] }> {
  const { draft } = prepared;
  const [sale] = await tx
    .insert(schema.sales)
    .values({
      channelId: draft.channel?.id ?? null,
      externalOrderNumber: draft.externalOrderNumber,
      orderedAt: new Date(`${draft.orderedAt}T12:00:00Z`),
      deliveryCountry: draft.deliveryCountry,
      shippingRevenueGross: centsToNumeric(prepared.shippingRevenueGross) ?? '0',
      postageCost: centsToNumeric(prepared.postageCost) ?? '0',
      discountGross: centsToNumeric(draft.discountGross) ?? '0',
      status: draft.status ?? 'open',
      shopifyOrderId: draft.shopifyOrderId ?? null,
    })
    .returning({ id: schema.sales.id });
  if (!sale) throw new Error('Verkauf konnte nicht angelegt werden.');

  const warnings: string[] = [];
  for (const line of prepared.lines) {
    const [item] = await tx
      .insert(schema.saleItems)
      .values({
        saleId: sale.id,
        variantId: line.variantId,
        quantity: line.quantity,
        unitPriceGross: centsToNumeric(line.unitPriceGross) ?? '0',
        vatRate: rateToNumeric(line.vatRate) ?? '0',
        shopifyLineItemId: line.shopifyLineItemId ?? null,
      })
      .returning({ id: schema.saleItems.id });
    if (!item) throw new Error('Position konnte nicht angelegt werden.');

    const allocations = planIssue(await batchStock(tx, line.variantId), line.quantity);
    await postEntry(tx, {
      variantId: line.variantId,
      kind: 'sale',
      quantity: -line.quantity,
      postedAt: draft.orderedAt,
      saleItemId: item.id,
      allocations,
    });
    const missing = -allocations.filter((a) => a.batchId === null).reduce((total, a) => total + a.quantity, 0);
    if (missing > 0) warnings.push(`${line.sku}: ${missing} Stück ohne Bestand gebucht (Fehlmenge).`);
  }

  if (prepared.fee !== 0) {
    await tx
      .insert(schema.fees)
      .values({ saleId: sale.id, kind: 'transaction', amount: centsToNumeric(prepared.fee) ?? '0', source: 'flat' });
  }
  return { id: sale.id, warnings };
}

/** Reverses every `sale` entry and sets the status to `cancelled` (F10); fees stay (F11). */
export async function cancelSale(
  tx: Tx,
  sale: { id: string; externalOrderNumber: string; itemIds: readonly string[] },
  note: string | null,
): Promise<void> {
  const entries =
    sale.itemIds.length === 0
      ? []
      : await tx.query.stockEntries.findMany({
          where: and(inArray(schema.stockEntries.saleItemId, [...sale.itemIds]), eq(schema.stockEntries.kind, 'sale')),
          with: { allocations: true },
        });
  for (const entry of entries) {
    await reverseEntry(tx, entry, note ?? `Storno ${sale.externalOrderNumber}`);
  }
  await tx.update(schema.sales).set({ status: 'cancelled' }).where(eq(schema.sales.id, sale.id));
}

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

export interface RefundDraft {
  quantity: number;
  amountGross: Cents;
  restocked: boolean;
  damaged: boolean;
  refundedAt: string;
  note: string | null;
  shopifyRefundId?: string;
}

/**
 * Return, refund without goods or goodwill. A return puts the goods back where
 * the line came from (F13); damaged goods are written off right away (F12).
 */
export async function insertRefund(
  tx: Tx,
  sale: { id: string; externalOrderNumber: string },
  item: { id: string; variantId: string } | null,
  refund: RefundDraft,
): Promise<void> {
  if (refund.restocked && item !== null) {
    const plan = planReturn(await returnSources(tx, item.id), refund.quantity);
    const now = new Date();
    if (plan.closedShortfall > 0) await closeOpenShortfall(tx, item.id, plan.closedShortfall, now);
    await postEntry(tx, {
      variantId: item.variantId,
      kind: 'return',
      quantity: refund.quantity,
      postedAt: refund.refundedAt,
      note: refund.note,
      saleItemId: item.id,
      allocations: [
        ...plan.toBatches,
        ...(plan.closedShortfall > 0 ? [{ batchId: null, quantity: plan.closedShortfall, resolvedAt: now }] : []),
      ],
    });
    if (refund.damaged) {
      await postEntry(tx, {
        variantId: item.variantId,
        kind: 'shrinkage',
        quantity: -refund.quantity,
        postedAt: refund.refundedAt,
        note: `Retoure beschädigt (${sale.externalOrderNumber})`,
        saleItemId: item.id,
        allocations: planIssue(await batchStock(tx, item.variantId), refund.quantity),
      });
    } else if (plan.toBatches.length > 0) {
      await resolveShortfalls(tx, item.variantId);
    }
  }

  await tx.insert(schema.refunds).values({
    saleId: sale.id,
    saleItemId: item?.id ?? null,
    quantity: refund.quantity,
    amountGross: centsToNumeric(refund.amountGross) ?? '0',
    restocked: refund.restocked,
    damaged: refund.damaged,
    refundedAt: new Date(`${refund.refundedAt}T12:00:00Z`),
    note: refund.note,
    shopifyRefundId: refund.shopifyRefundId ?? null,
  });
}
