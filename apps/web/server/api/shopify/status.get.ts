import { useDb } from '../../db/client.js';
import type { ShopifyStatus } from '../../../shared/types/api.js';
import { shopifyConfig } from '../../utils/shopify.js';
import { compareWithShopify } from '../../utils/shopify-status.js';

/** Connection check and SKU comparison; reads Shopify, writes nothing (G6). */
export default defineEventHandler(async (): Promise<ShopifyStatus> => {
  const config = shopifyConfig();
  if (!config) return { configured: false, shop: null, rows: [], unknownInShopify: [] };

  const { match, rows } = await compareWithShopify(useDb());
  return {
    configured: true,
    shop: config.shop,
    rows,
    unknownInShopify: match.unknownInShopify.map((v) => ({ sku: v.sku, variantId: v.variantId })),
  };
});
