/**
 * Journal writes and derived stock: remaining quantity per batch, shortfall
 * resolution, computed landed cost and the goods receipt view.
 */

import { and, asc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import {
  buildVariantLabel,
  convertToEur,
  deliveryState,
  distributeAdditionalCosts,
  planShortfallResolution,
  type BatchStock,
  type PlannedAllocation,
} from '@roslett/core';
import type { useDb } from '../db/client.js';
import { schema } from '../db/client.js';
import type { Position } from '../../shared/schemas/goods-receipt.js';
import { badRequest } from './errors.js';
import { centsToNumeric, numericToCents } from './money.js';

type Db = ReturnType<typeof useDb>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Reader = Pick<Db, 'select' | 'query'>;

type StockKind = (typeof schema.stockEntryKindEnum.enumValues)[number];

/** Batches of posted receipts with their remaining quantity (sum of allocations). */
export async function batchStock(db: Reader, variantId: string): Promise<BatchStock[]> {
  return db
    .select({
      id: schema.batches.id,
      invoiceDate: schema.goodsReceipts.invoiceDate,
      // Qualified on purpose: an unqualified "id" would bind to the subquery's table.
      remaining: sql<number>`coalesce((select sum(a.quantity) from batch_allocations a where a.batch_id = batches.id), 0)::int`,
    })
    .from(schema.batches)
    .innerJoin(schema.goodsReceipts, eq(schema.batches.goodsReceiptId, schema.goodsReceipts.id))
    .where(and(eq(schema.batches.variantId, variantId), eq(schema.goodsReceipts.state, 'posted')));
}

export async function currentStock(db: Reader, variantId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.stockEntries.quantity}), 0)::int` })
    .from(schema.stockEntries)
    .where(eq(schema.stockEntries.variantId, variantId));
  return row?.total ?? 0;
}

/** Writes one journal entry with its allocations; allocations must add up to the quantity. */
export async function postEntry(
  tx: Tx,
  entry: {
    variantId: string;
    kind: StockKind;
    quantity: number;
    postedAt?: string;
    note?: string | null;
    saleItemId?: string;
    reversesId?: string;
    allocations: readonly (PlannedAllocation & { resolvedAt?: Date })[];
  },
): Promise<string> {
  const sum = entry.allocations.reduce((total, a) => total + a.quantity, 0);
  if (sum !== entry.quantity) {
    throw new Error(`Zuordnungen (${sum}) passen nicht zur Menge (${entry.quantity}).`);
  }
  const [created] = await tx
    .insert(schema.stockEntries)
    .values({
      variantId: entry.variantId,
      kind: entry.kind,
      quantity: entry.quantity,
      postedAt: entry.postedAt ? new Date(`${entry.postedAt}T12:00:00Z`) : new Date(),
      note: entry.note ?? null,
      saleItemId: entry.saleItemId ?? null,
      reversesId: entry.reversesId ?? null,
    })
    .returning({ id: schema.stockEntries.id });
  if (!created) throw new Error('Buchung konnte nicht angelegt werden.');

  if (entry.allocations.length > 0) {
    await tx.insert(schema.batchAllocations).values(
      entry.allocations.map((a) => ({
        stockEntryId: created.id,
        batchId: a.batchId,
        quantity: a.quantity,
        resolvedAt: a.resolvedAt ?? null,
      })),
    );
  }
  return created.id;
}

/** Assigns open shortfalls of a variant to stock that has arrived since (oldest first). */
export async function resolveShortfalls(tx: Tx, variantId: string): Promise<number> {
  const open = await tx
    .select({
      id: schema.batchAllocations.id,
      stockEntryId: schema.batchAllocations.stockEntryId,
      quantity: schema.batchAllocations.quantity,
    })
    .from(schema.batchAllocations)
    .innerJoin(schema.stockEntries, eq(schema.batchAllocations.stockEntryId, schema.stockEntries.id))
    .where(
      and(
        eq(schema.stockEntries.variantId, variantId),
        isNull(schema.batchAllocations.batchId),
        isNull(schema.batchAllocations.resolvedAt),
        lt(schema.batchAllocations.quantity, 0),
      ),
    )
    .orderBy(asc(schema.stockEntries.postedAt), asc(schema.stockEntries.createdAt));
  if (open.length === 0) return 0;

  const plans = planShortfallResolution(
    open.map((o) => ({ allocationId: o.id, quantity: o.quantity })),
    await batchStock(tx, variantId),
  );
  const now = new Date();
  let resolved = 0;
  for (const plan of plans) {
    const [first, ...rest] = plan.parts;
    if (first === undefined) continue;
    const entryId = open.find((o) => o.id === plan.allocationId)?.stockEntryId;
    if (entryId === undefined) continue;

    // The shortfall row becomes the first resolved part; further parts and the
    // still-missing rest are added as rows of the same entry.
    await tx
      .update(schema.batchAllocations)
      .set({ batchId: first.batchId, quantity: first.quantity, resolvedAt: now })
      .where(eq(schema.batchAllocations.id, plan.allocationId));
    const extra = [
      ...rest.map((part) => ({ stockEntryId: entryId, batchId: part.batchId, quantity: part.quantity, resolvedAt: now })),
      ...(plan.open < 0 ? [{ stockEntryId: entryId, batchId: null, quantity: plan.open, resolvedAt: null }] : []),
    ];
    if (extra.length > 0) await tx.insert(schema.batchAllocations).values(extra);
    resolved += 1;
  }
  return resolved;
}

/** Landed cost per unit for each position, computed from current additional costs. */
export function landedCosts(
  positions: readonly { id: string; variantId: string; quantityOrdered: number; unitPriceEur: string }[],
  costs: readonly { kind: string; amountEur: string; distributionMethod: 'value' | 'quantity' }[],
): Map<string, { landedCostEur: number; additionalCostsEur: number }> {
  if (positions.length === 0) return new Map();
  const result = distributeAdditionalCosts(
    positions.map((p) => ({
      id: p.id,
      variantId: p.variantId,
      quantity: p.quantityOrdered,
      goodsValueEur: (numericToCents(p.unitPriceEur) ?? 0) * p.quantityOrdered,
    })),
    costs.map((c) => ({
      label: c.kind,
      amountEur: numericToCents(c.amountEur) ?? 0,
      distributionMethod: c.distributionMethod,
    })),
  );
  return new Map(
    result.items.map((item) => [
      item.batchId,
      { landedCostEur: item.landedCostEur, additionalCostsEur: item.additionalCostsEur },
    ]),
  );
}

/** Rejects unknown or archived variants with a per-field error. */
export async function assertVariants(db: Reader, positions: readonly Position[]): Promise<void> {
  const ids = [...new Set(positions.map((p) => p.variantId))];
  if (ids.length === 0) return;
  const found = await db.query.variants.findMany({
    where: inArray(schema.variants.id, ids),
    columns: { id: true, archivedAt: true },
  });
  positions.forEach((p, index) => {
    const variant = found.find((v) => v.id === p.variantId);
    if (variant === undefined || variant.archivedAt !== null) {
      throw badRequest('Eine Variante gibt es nicht oder sie ist archiviert.', {
        [`positions.${index}.variantId`]: 'Variante nicht verfügbar.',
      });
    }
  });
}

/** Position rows with the EUR price frozen at the receipt's exchange rate. */
export function positionRows(receiptId: string, positions: readonly Position[], rate: number) {
  return positions.map((p) => ({
    goodsReceiptId: receiptId,
    variantId: p.variantId,
    quantityOrdered: p.quantityOrdered,
    unitPriceForeign: p.unitPrice,
    unitPriceEur: centsToNumeric(convertToEur(p.unitPrice, rate)) ?? '0',
    note: p.note ?? null,
  }));
}

/** Delivered quantity per batch: receipts minus their reversals. */
async function deliveredByBatch(db: Reader, batchIds: string[]): Promise<Map<string, number>> {
  if (batchIds.length === 0) return new Map();
  const rows = await db
    .select({ batchId: schema.batchAllocations.batchId, delivered: sql<number>`sum(batch_allocations.quantity)::int` })
    .from(schema.batchAllocations)
    .innerJoin(schema.stockEntries, eq(schema.batchAllocations.stockEntryId, schema.stockEntries.id))
    .where(
      and(
        inArray(schema.batchAllocations.batchId, batchIds),
        sql`(stock_entries.kind = 'goods_receipt' or exists (
          select 1 from stock_entries o where o.id = stock_entries.reverses_id and o.kind = 'goods_receipt'))`,
      ),
    )
    .groupBy(schema.batchAllocations.batchId);
  return new Map(rows.map((r) => [r.batchId ?? '', r.delivered]));
}

export async function loadReceipt(db: Reader, id: string) {
  const receipt = await db.query.goodsReceipts.findFirst({
    where: eq(schema.goodsReceipts.id, id),
    with: {
      supplier: { columns: { id: true, name: true } },
      batches: {
        orderBy: [asc(schema.batches.createdAt)],
        with: { variant: { with: { color: true, product: { columns: { id: true, name: true } } } } },
      },
      additionalCosts: { orderBy: [asc(schema.additionalCosts.createdAt)] },
    },
  });
  if (receipt === undefined) return undefined;

  const costs = landedCosts(receipt.batches, receipt.additionalCosts);
  const delivered = await deliveredByBatch(
    db,
    receipt.batches.map((b) => b.id),
  );

  const positions = receipt.batches.map((b) => {
    const unitPriceEur = numericToCents(b.unitPriceEur) ?? 0;
    const cost = costs.get(b.id);
    const deliveredQuantity = delivered.get(b.id) ?? 0;
    return {
      id: b.id,
      variant: {
        id: b.variant.id,
        sku: b.variant.sku,
        label: buildVariantLabel(b.variant.color?.name, b.variant.size),
        productId: b.variant.product.id,
        productName: b.variant.product.name,
      },
      quantityOrdered: b.quantityOrdered,
      delivered: deliveredQuantity,
      deliveryState: deliveryState(b.quantityOrdered, deliveredQuantity),
      unitPriceForeign: b.unitPriceForeign,
      unitPriceEur,
      additionalCostsEur: cost?.additionalCostsEur ?? 0,
      landedCostEur: cost?.landedCostEur ?? unitPriceEur,
      note: b.note,
    };
  });

  const ordered = positions.reduce((total, p) => total + p.quantityOrdered, 0);
  const deliveredTotal = positions.reduce((total, p) => total + Math.min(p.delivered, p.quantityOrdered), 0);
  const goodsValueEur = positions.reduce((total, p) => total + p.unitPriceEur * p.quantityOrdered, 0);
  const additionalCostsEur = receipt.additionalCosts.reduce((total, c) => total + (numericToCents(c.amountEur) ?? 0), 0);

  return {
    id: receipt.id,
    kind: receipt.kind,
    number: receipt.number,
    supplier: receipt.supplier,
    invoiceNumber: receipt.invoiceNumber,
    invoiceDate: receipt.invoiceDate,
    currency: receipt.currency,
    exchangeRate: Number(receipt.exchangeRate),
    exchangeRateSource: receipt.exchangeRateSource,
    state: receipt.state,
    deliveryState: positions.length === 0 ? 'open' : deliveryState(ordered, deliveredTotal),
    createdAt: receipt.createdAt,
    positions,
    additionalCosts: receipt.additionalCosts.map((c) => ({
      id: c.id,
      kind: c.kind,
      amountEur: numericToCents(c.amountEur) ?? 0,
      distributionMethod: c.distributionMethod,
      incurredOn: c.incurredOn,
      note: c.note,
    })),
    totals: {
      quantityOrdered: ordered,
      delivered: positions.reduce((total, p) => total + p.delivered, 0),
      goodsValueEur,
      additionalCostsEur,
      landedTotalEur: goodsValueEur + additionalCostsEur,
    },
  };
}
