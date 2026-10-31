import { useDb } from '../../db/client.js';
import type { ShopifyPricePushResult } from '../../../shared/types/api.js';
import { pushShopifyPrices } from '../../utils/shopify-prices.js';

/** Writes the current differences to Shopify after the user confirmed the preview. */
export default defineEventHandler((): Promise<ShopifyPricePushResult> => pushShopifyPrices(useDb()));
