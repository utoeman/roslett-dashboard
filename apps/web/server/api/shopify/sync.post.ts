import { useDb } from '../../db/client.js';
import type { ShopifySyncResult } from '../../../shared/types/api.js';
import { syncShopifyOrders } from '../../utils/shopify-sync.js';

/** "Jetzt abrufen" (G10): imports orders, refunds and cancellations since the last run. */
export default defineEventHandler((): Promise<ShopifySyncResult> => syncShopifyOrders(useDb(), 'manual'));
