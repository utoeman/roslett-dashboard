import { timingSafeEqual } from 'node:crypto';
import { useDb } from '../../db/client.js';
import type { ShopifySyncResult } from '../../../shared/types/api.js';
import { shopifyConfig } from '../../utils/shopify.js';
import { syncShopifyOrders } from '../../utils/shopify-sync.js';

function authorized(header: string | undefined, secret: string): boolean {
  if (!secret || !header?.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Called by the Netlify scheduled functions, not by a browser: the session
 * check is skipped in the auth middleware and replaced by NUXT_CRON_SECRET.
 * `?scope=nightly` looks back 48 hours regardless of the cursor.
 */
export default defineEventHandler(async (event): Promise<ShopifySyncResult | { skipped: string }> => {
  if (!authorized(getHeader(event, 'authorization'), useRuntimeConfig().cronSecret)) {
    throw createError({ statusCode: 401, statusMessage: 'Nicht berechtigt', data: { fehler: 'Ungültiges Cron-Secret.' } });
  }
  if (!shopifyConfig()) return { skipped: 'Die Shopify-Anbindung ist nicht eingerichtet.' };
  const nightly = getQuery(event).scope === 'nightly';
  return syncShopifyOrders(useDb(), nightly ? 'nightly' : 'scheduled');
});
