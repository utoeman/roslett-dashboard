/**
 * Price and landed-cost push (stage 2a): compare linked variants with Shopify
 * and write only the differences. Nothing is stored in the dashboard; the next
 * comparison shows the result.
 */

import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { centsToEuros, planPriceChanges, type PriceChange, type PricePlan } from '@roslett/core';
import { schema, type useDb } from '../db/client.js';
import type { ShopifyPricePushResult } from '../../shared/types/api.js';
import { stockFigures } from './inventory.js';
import { numericToCents } from './money.js';
import { fetchShopifyVariants, shopifyGraphql } from './shopify.js';

type Db = ReturnType<typeof useDb>;

interface UserErrors {
  userErrors: { field: string[] | null; message: string }[];
}

export async function planShopifyPrices(db: Db): Promise<PricePlan> {
  const variants = await db
    .select({
      id: schema.variants.id,
      sku: schema.variants.sku,
      shopifyVariantId: schema.variants.shopifyVariantId,
      priceGross: schema.variants.priceGross,
      basePriceGross: schema.products.basePriceGross,
    })
    .from(schema.variants)
    .innerJoin(schema.products, eq(schema.variants.productId, schema.products.id))
    .where(and(isNull(schema.variants.archivedAt), isNotNull(schema.variants.shopifyVariantId)))
    .orderBy(schema.variants.sku);

  const [figures, shopify] = await Promise.all([stockFigures(db, variants.map((v) => v.id)), fetchShopifyVariants()]);
  const byId = new Map(shopify.map((v) => [v.variantId, v]));

  return planPriceChanges(
    variants.flatMap((v) => {
      const remote = v.shopifyVariantId ? byId.get(v.shopifyVariantId) : undefined;
      if (remote === undefined) return [];
      return [
        {
          variantId: v.id,
          sku: v.sku,
          priceGross: numericToCents(v.priceGross) ?? numericToCents(v.basePriceGross),
          costEur: figures.get(v.id)?.averageCostEur ?? null,
          shopify: {
            variantId: remote.variantId,
            productId: remote.productId,
            inventoryItemId: remote.inventoryItemId,
            price: remote.price,
            unitCost: remote.unitCost,
          },
        },
      ];
    }),
  );
}

const amount = (cents: number) => centsToEuros(cents).toFixed(2);
const messages = (result: UserErrors) => result.userErrors.map((e) => e.message).join('; ');

/** Prices go per product (one bulk call each), costs per inventory item. */
async function pushChanges(changes: readonly PriceChange[]): Promise<ShopifyPricePushResult> {
  const errors: { sku: string; message: string }[] = [];
  let prices = 0;
  let costs = 0;

  const byProduct = new Map<string, PriceChange[]>();
  for (const change of changes) {
    if (change.price) byProduct.set(change.productId, [...(byProduct.get(change.productId) ?? []), change]);
  }
  for (const [productId, group] of byProduct) {
    const data = await shopifyGraphql<{ productVariantsBulkUpdate: UserErrors }>(
      `mutation Prices($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } }
      }`,
      { productId, variants: group.map((c) => ({ id: c.shopifyVariantId, price: amount(c.price?.to ?? 0) })) },
    );
    if (data.productVariantsBulkUpdate.userErrors.length > 0) {
      for (const c of group) errors.push({ sku: c.sku, message: messages(data.productVariantsBulkUpdate) });
    } else {
      prices += group.length;
    }
  }

  for (const change of changes) {
    if (!change.cost) continue;
    const data = await shopifyGraphql<{ inventoryItemUpdate: UserErrors }>(
      `mutation Cost($id: ID!, $input: InventoryItemInput!) {
        inventoryItemUpdate(id: $id, input: $input) { userErrors { field message } }
      }`,
      { id: change.inventoryItemId, input: { cost: amount(change.cost.to) } },
    );
    if (data.inventoryItemUpdate.userErrors.length > 0) {
      errors.push({ sku: change.sku, message: messages(data.inventoryItemUpdate) });
    } else {
      costs += 1;
    }
  }
  return { prices, costs, errors };
}

/** The plan is recomputed here, never taken from the client. */
export async function pushShopifyPrices(db: Db): Promise<ShopifyPricePushResult> {
  const { changes } = await planShopifyPrices(db);
  return pushChanges(changes);
}
