import { eq, inArray } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { compareWithShopify } from '../../utils/shopify-status.js';

/**
 * Stores the Shopify IDs of every SKU match (G5). The match is recomputed here
 * instead of trusting the client; only the dashboard is written.
 */
export default defineEventHandler(async () => {
  const db = useDb();
  const { match } = await compareWithShopify(db);
  if (match.matched.length === 0) return { linked: 0 };

  await db.transaction(async (tx) => {
    // A Shopify variant may now sit under another SKU; release its ID first (unique index).
    await tx
      .update(schema.variants)
      .set({ shopifyVariantId: null, shopifyInventoryItemId: null })
      .where(inArray(schema.variants.shopifyVariantId, match.matched.map((m) => m.shopify.variantId)));
    for (const m of match.matched) {
      const [variant] = await tx
        .update(schema.variants)
        .set({ shopifyVariantId: m.shopify.variantId, shopifyInventoryItemId: m.shopify.inventoryItemId })
        .where(eq(schema.variants.id, m.variantId))
        .returning({ productId: schema.variants.productId });
      if (variant) {
        await tx
          .update(schema.products)
          .set({ shopifyProductId: m.shopify.productId })
          .where(eq(schema.products.id, variant.productId));
      }
    }
  });
  return { linked: match.matched.length };
});
