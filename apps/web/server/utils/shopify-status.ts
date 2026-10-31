/** Dashboard ↔ Shopify comparison by SKU, shared by the status and link routes. */

import { eq, isNull } from 'drizzle-orm';
import { matchShopifyVariants, type MatchResult } from '@roslett/core';
import { schema, type useDb } from '../db/client.js';
import type { ShopifyMatchRow } from '../../shared/types/api.js';
import { stockFigures } from './inventory.js';
import { fetchShopifyVariants } from './shopify.js';

type Db = ReturnType<typeof useDb>;

export async function compareWithShopify(db: Db): Promise<{ match: MatchResult; rows: ShopifyMatchRow[] }> {
  const variants = await db
    .select({
      id: schema.variants.id,
      sku: schema.variants.sku,
      shopifyVariantId: schema.variants.shopifyVariantId,
      productName: schema.products.name,
    })
    .from(schema.variants)
    .innerJoin(schema.products, eq(schema.variants.productId, schema.products.id))
    .where(isNull(schema.variants.archivedAt))
    .orderBy(schema.variants.sku);

  const [stock, shopifyVariants] = await Promise.all([
    stockFigures(db, variants.map((v) => v.id)),
    fetchShopifyVariants(),
  ]);
  const match = matchShopifyVariants(
    variants.map((v) => ({ variantId: v.id, sku: v.sku })),
    shopifyVariants,
  );

  const matchedById = new Map(match.matched.map((m) => [m.variantId, m]));
  const duplicates = new Set(match.duplicateInShopify);
  const rows = variants.map((v): ShopifyMatchRow => {
    const hit = matchedById.get(v.id);
    let status: ShopifyMatchRow['status'] = 'missing';
    if (hit) status = v.shopifyVariantId === hit.shopify.variantId ? 'linked' : 'matched';
    else if (duplicates.has(v.sku)) status = 'duplicate';
    return {
      variantId: v.id,
      sku: v.sku,
      productName: v.productName,
      dashboardStock: stock.get(v.id)?.stock ?? 0,
      shopifyStock: hit ? hit.shopify.inventoryQuantity : null,
      status,
    };
  });
  return { match, rows };
}
