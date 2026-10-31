/**
 * Sales price and landed cost are owned by the dashboard (field ownership);
 * this plans what has to change in Shopify. Only differences are pushed.
 */

import type { Cents } from './money.js';
import { shopifyAmountToCents } from './shopify-orders.js';

export interface PriceSource {
  variantId: string;
  sku: string;
  /** Variant price, falling back to the product's base price; null = none set. */
  priceGross: Cents | null;
  /** Weighted average of open batches; null without stock history. */
  costEur: Cents | null;
  shopify: {
    variantId: string;
    productId: string;
    inventoryItemId: string;
    price: string;
    unitCost: string | null;
  };
}

export interface PriceChange {
  variantId: string;
  sku: string;
  shopifyVariantId: string;
  productId: string;
  inventoryItemId: string;
  price: { from: Cents; to: Cents } | null;
  cost: { from: Cents | null; to: Cents } | null;
}

export interface PricePlan {
  changes: PriceChange[];
  /** Linked variants without a dashboard price; Shopify keeps its price. */
  missingPrice: string[];
}

export function planPriceChanges(rows: readonly PriceSource[]): PricePlan {
  const changes: PriceChange[] = [];
  const missingPrice: string[] = [];
  for (const row of rows) {
    const shopifyPrice = shopifyAmountToCents(row.shopify.price);
    const shopifyCost = row.shopify.unitCost === null ? null : shopifyAmountToCents(row.shopify.unitCost);
    if (row.priceGross === null) missingPrice.push(row.sku);

    const price =
      row.priceGross !== null && row.priceGross !== shopifyPrice ? { from: shopifyPrice, to: row.priceGross } : null;
    const cost = row.costEur !== null && row.costEur !== shopifyCost ? { from: shopifyCost, to: row.costEur } : null;
    if (price === null && cost === null) continue;
    changes.push({
      variantId: row.variantId,
      sku: row.sku,
      shopifyVariantId: row.shopify.variantId,
      productId: row.shopify.productId,
      inventoryItemId: row.shopify.inventoryItemId,
      price,
      cost,
    });
  }
  return { changes, missingPrice };
}
