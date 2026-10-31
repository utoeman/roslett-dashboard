import { useDb } from '../../db/client.js';
import type { ShopifyStatus } from '../../../shared/types/api.js';
import { shopifyConfig } from '../../utils/shopify.js';
import { compareWithShopify } from '../../utils/shopify-status.js';

/** Connection check, SKU comparison and import state; reads Shopify, writes nothing (G6). */
export default defineEventHandler(async (): Promise<ShopifyStatus> => {
  const config = shopifyConfig();
  if (!config) return { configured: false, shop: null, rows: [], unknownInShopify: [], ordersSyncedTo: null, lastRun: null };

  const db = useDb();
  const [{ match, rows }, state] = await Promise.all([compareWithShopify(db), db.query.shopifySync.findFirst()]);
  return {
    configured: true,
    shop: config.shop,
    rows,
    unknownInShopify: match.unknownInShopify.map((v) => ({ sku: v.sku, variantId: v.variantId })),
    ordersSyncedTo: state?.ordersSyncedTo.toISOString() ?? null,
    lastRun:
      state?.lastRunTrigger && state.lastRunResult
        ? { at: state.updatedAt.toISOString(), trigger: state.lastRunTrigger, result: state.lastRunResult }
        : null,
  };
});
