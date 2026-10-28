/**
 * Sales: VAT lookup and the sale view with FIFO cost and margin per line.
 * The calculation itself lives in @roslett/core.
 */

import { and, desc, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import {
  buildVariantLabel,
  calculateTotalCost,
  costItemsForVariant,
  round,
  saleMargins,
  type CostItem,
} from '@roslett/core';
import type { useDb } from '../db/client.js';
import { schema } from '../db/client.js';
import { stockFigures } from './inventory.js';
import { mapCostItem } from './mapping.js';
import { numericToCents, numericToRate } from './money.js';
import { landedCosts } from './stock.js';

type Reader = Pick<ReturnType<typeof useDb>, 'select' | 'query'>;
type VatCategory = (typeof schema.vatCategoryEnum.enumValues)[number];

/** Rate valid on the given ISO date for the delivery country, or null if none is set up. */
export async function vatRateFor(db: Reader, country: string, category: VatCategory, date: string): Promise<number | null> {
  const [row] = await db
    .select({ rate: schema.vatRates.rate })
    .from(schema.vatRates)
    .where(
      and(
        eq(schema.vatRates.country, country),
        eq(schema.vatRates.vatCategory, category),
        lte(schema.vatRates.validFrom, date),
      ),
    )
    .orderBy(desc(schema.vatRates.validFrom))
    .limit(1);
  return row === undefined ? null : numericToRate(row.rate);
}

/** Computed landed cost per batch; depends on all positions of the batch's receipt. */
async function landedCostByBatch(db: Reader, batchIds: readonly string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (batchIds.length === 0) return result;
  const rows = await db
    .select({ receiptId: schema.batches.goodsReceiptId })
    .from(schema.batches)
    .where(inArray(schema.batches.id, [...batchIds]));
  const receipts = await db.query.goodsReceipts.findMany({
    where: inArray(schema.goodsReceipts.id, [...new Set(rows.map((r) => r.receiptId))]),
    with: { batches: true, additionalCosts: true },
  });
  for (const receipt of receipts) {
    for (const [batchId, cost] of landedCosts(receipt.batches, receipt.additionalCosts)) {
      result.set(batchId, cost.landedCostEur);
    }
  }
  return result;
}

async function activeCostItems(db: Reader, variantIds: readonly string[]): Promise<CostItem[]> {
  const rows = await db.query.costItems.findMany({
    where: and(
      eq(schema.costItems.active, true),
      or(isNull(schema.costItems.variantId), inArray(schema.costItems.variantId, [...variantIds])),
    ),
  });
  return rows.map((row) => {
    const item = mapCostItem(row);
    return { ...item, value: item.value ?? 0 };
  });
}

/** Sales with lines, fees, FIFO cost and margins, in the order of `ids`; unknown ids are skipped. */
export async function loadSales(db: Reader, ids: readonly string[]) {
  if (ids.length === 0) return [];
  const sales = await db.query.sales.findMany({
    where: inArray(schema.sales.id, [...ids]),
    with: {
      channel: { columns: { id: true, name: true } },
      fees: true,
      items: {
        with: {
          variant: { with: { color: true, product: { columns: { id: true, name: true } } } },
          stockEntries: { with: { allocations: true } },
        },
      },
    },
  });

  // One round of lookups for the whole page instead of one per sale.
  const allItems = sales.flatMap((s) => s.items);
  const variantIds = [...new Set(allItems.map((i) => i.variantId))];
  const allocations = allItems.flatMap((item) =>
    item.stockEntries.flatMap((entry) => entry.allocations.map((a) => ({ ...a, saleItemId: item.id }))),
  );
  const [landed, figures, costItems] = await Promise.all([
    landedCostByBatch(db, [...new Set(allocations.flatMap((a) => (a.batchId === null ? [] : [a.batchId])))]),
    stockFigures(db, variantIds),
    activeCostItems(db, variantIds),
  ]);

  const view = (sale: (typeof sales)[number]) => {
    const items = sale.items.map((item) => {
      let costOfGoodsEur = 0;
      let shortfall = 0;
      for (const a of allocations) {
        if (a.saleItemId !== item.id) continue;
        if (a.batchId !== null) {
          costOfGoodsEur += -a.quantity * (landed.get(a.batchId) ?? 0);
        } else if (a.resolvedAt === null) {
          // Open shortfall: valued at the current average until stock arrives (E8).
          shortfall += -a.quantity;
          costOfGoodsEur += -a.quantity * (figures.get(item.variantId)?.averageCostEur ?? 0);
        }
      }
      const unitLanded = round(costOfGoodsEur / item.quantity);
      const unitCostItemsEur =
        calculateTotalCost(unitLanded, costItemsForVariant(costItems, item.variantId)).totalCostEur - unitLanded;
      return { item, costOfGoodsEur, shortfall, unitCostItemsEur };
    });

    const shippingRevenueGross = numericToCents(sale.shippingRevenueGross) ?? 0;
    const postageCost = numericToCents(sale.postageCost) ?? 0;
    const discountGross = numericToCents(sale.discountGross) ?? 0;
    const fees = sale.fees.map((f) => ({ id: f.id, kind: f.kind, amount: numericToCents(f.amount) ?? 0, source: f.source }));

    const margins = saleMargins({
      shippingRevenueGross,
      postageCost,
      discountGross,
      feesEur: fees.reduce((total, f) => total + f.amount, 0),
      lines: items.map(({ item, costOfGoodsEur, unitCostItemsEur }) => ({
        id: item.id,
        quantity: item.quantity,
        unitPriceGross: numericToCents(item.unitPriceGross) ?? 0,
        vatRate: numericToRate(item.vatRate) ?? 0,
        costOfGoodsEur,
        unitCostItemsEur,
      })),
    });

    return {
      id: sale.id,
      channel: sale.channel,
      externalOrderNumber: sale.externalOrderNumber,
      orderedAt: sale.orderedAt,
      deliveryCountry: sale.deliveryCountry,
      shippingRevenueGross,
      postageCost,
      discountGross,
      status: sale.status,
      createdAt: sale.createdAt,
      fees,
      items: items.map(({ item, shortfall }, i) => ({
        ...margins.lines[i],
        id: item.id,
        variant: {
          id: item.variant.id,
          sku: item.variant.sku,
          label: buildVariantLabel(item.variant.color?.name, item.variant.size),
          productId: item.variant.product.id,
          productName: item.variant.product.name,
        },
        quantity: item.quantity,
        unitPriceGross: numericToCents(item.unitPriceGross) ?? 0,
        vatRate: numericToRate(item.vatRate) ?? 0,
        shortfall,
      })),
      totals: margins.totals,
      /** Part of the cost is an estimate while a shortfall is open. */
      provisional: items.some((i) => i.shortfall > 0),
    };
  };

  return ids.flatMap((id) => {
    const sale = sales.find((s) => s.id === id);
    return sale === undefined ? [] : [view(sale)];
  });
}
