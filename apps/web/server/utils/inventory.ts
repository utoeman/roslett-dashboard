/**
 * Stock, FIFO stock value and margin before fees per variant, derived from the
 * journal and the computed landed cost of posted receipts.
 */

import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import { marginBeforeFees, valueStock, type ValuedBatch } from '@trd/core';
import type { useDb } from '../db/client.js';
import { schema } from '../db/client.js';
import type { VariantInventory } from '../../shared/types/api.js';
import { numericToRate } from './money.js';
import { landedCosts } from './stock.js';

type Reader = Pick<ReturnType<typeof useDb>, 'select' | 'query'>;
type VatCategory = (typeof schema.vatCategoryEnum.enumValues)[number];

/** Sales country for margins; all prices are German shelf prices. */
const SALES_COUNTRY = 'DE';

export interface StockFigures {
  stock: number;
  stockValueEur: number;
  averageCostEur: number | null;
}

/** Stock and valuation per variant; variants without entries get zeros. */
export async function stockFigures(db: Reader, variantIds: readonly string[]): Promise<Map<string, StockFigures>> {
  const result = new Map<string, StockFigures>(
    variantIds.map((id) => [id, { stock: 0, stockValueEur: 0, averageCostEur: null }]),
  );
  if (variantIds.length === 0) return result;
  const ids = [...variantIds];

  const stockRows = await db
    .select({ variantId: schema.stockEntries.variantId, total: sql<number>`sum(${schema.stockEntries.quantity})::int` })
    .from(schema.stockEntries)
    .where(inArray(schema.stockEntries.variantId, ids))
    .groupBy(schema.stockEntries.variantId);

  const batches = await db
    .select({
      id: schema.batches.id,
      variantId: schema.batches.variantId,
      goodsReceiptId: schema.batches.goodsReceiptId,
      invoiceDate: schema.goodsReceipts.invoiceDate,
      // Qualified on purpose: an unqualified "id" would bind to the subquery's table.
      remaining: sql<number>`coalesce((select sum(a.quantity) from batch_allocations a where a.batch_id = batches.id), 0)::int`,
    })
    .from(schema.batches)
    .innerJoin(schema.goodsReceipts, eq(schema.batches.goodsReceiptId, schema.goodsReceipts.id))
    .where(and(inArray(schema.batches.variantId, ids), eq(schema.goodsReceipts.state, 'posted')));

  // Landed cost depends on all positions of a receipt, not only the requested variants.
  const receiptIds = [...new Set(batches.map((b) => b.goodsReceiptId))];
  const receipts =
    receiptIds.length > 0
      ? await db.query.goodsReceipts.findMany({
          where: inArray(schema.goodsReceipts.id, receiptIds),
          with: { batches: true, additionalCosts: true },
        })
      : [];
  const landed = new Map<string, number>();
  for (const receipt of receipts) {
    for (const [batchId, cost] of landedCosts(receipt.batches, receipt.additionalCosts)) {
      landed.set(batchId, cost.landedCostEur);
    }
  }

  const byVariant = new Map<string, ValuedBatch[]>();
  for (const b of batches) {
    const list = byVariant.get(b.variantId) ?? [];
    list.push({ id: b.id, invoiceDate: b.invoiceDate, remaining: b.remaining, landedCostEur: landed.get(b.id) ?? 0 });
    byVariant.set(b.variantId, list);
  }

  for (const id of ids) {
    const valuation = valueStock(byVariant.get(id) ?? []);
    result.set(id, {
      stock: stockRows.find((r) => r.variantId === id)?.total ?? 0,
      stockValueEur: valuation.valueEur,
      averageCostEur: valuation.averageCostEur,
    });
  }
  return result;
}

/** VAT rates valid today per category. */
export async function currentVatRates(db: Reader): Promise<Partial<Record<VatCategory, number>>> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({ vatCategory: schema.vatRates.vatCategory, rate: schema.vatRates.rate })
    .from(schema.vatRates)
    .where(and(eq(schema.vatRates.country, SALES_COUNTRY), lte(schema.vatRates.validFrom, today)))
    .orderBy(desc(schema.vatRates.validFrom));
  const rates: Partial<Record<VatCategory, number>> = {};
  for (const row of rows) {
    const rate = numericToRate(row.rate);
    if (rates[row.vatCategory] === undefined && rate !== null) rates[row.vatCategory] = rate;
  }
  return rates;
}

/** Combines stock figures with the variant's price into the API shape. */
export function inventoryOf(
  figures: StockFigures | undefined,
  variant: { priceGross: number | null; minimumStock: number },
  product: { basePriceGross: number | null; vatCategory: VatCategory },
  vatRates: Partial<Record<VatCategory, number>>,
): VariantInventory {
  const { stock, stockValueEur, averageCostEur } = figures ?? { stock: 0, stockValueEur: 0, averageCostEur: null };
  const priceGross = variant.priceGross ?? product.basePriceGross;
  const vatRate = vatRates[product.vatCategory];
  const margin =
    priceGross !== null && vatRate !== undefined && averageCostEur !== null
      ? marginBeforeFees(priceGross, vatRate, averageCostEur)
      : null;
  return {
    stock,
    stockValueEur,
    averageCostEur,
    belowMinimum: variant.minimumStock > 0 && stock < variant.minimumStock,
    priceNetEur: margin?.salesPriceNetEur ?? null,
    marginEur: margin?.contributionMarginEur ?? null,
    margin: margin?.margin ?? null,
  };
}

type ProductWithVariants = {
  basePriceGross: number | null;
  vatCategory: VatCategory;
  variants: { id: string; priceGross: number | null; minimumStock: number }[];
};

/** Adds `inventory` to every variant of the given products. */
export async function withInventory<P extends ProductWithVariants>(db: Reader, products: P[]) {
  const [figures, vatRates] = await Promise.all([
    stockFigures(
      db,
      products.flatMap((p) => p.variants.map((v) => v.id)),
    ),
    currentVatRates(db),
  ]);
  return products.map((product) => ({
    ...product,
    variants: product.variants.map((variant) => ({
      ...variant,
      inventory: inventoryOf(figures.get(variant.id), variant, product, vatRates),
    })),
  }));
}
