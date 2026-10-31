import { useDb } from '../../../db/client.js';
import type { ShopifyProductPushResult } from '../../../../shared/types/api.js';
import { readId } from '../../../utils/validation.js';
import { pushProductToShopify } from '../../../utils/shopify-products.js';

/** Creates or updates the product in Shopify after the preview (stage 3a). */
export default defineEventHandler((event): Promise<ShopifyProductPushResult> => pushProductToShopify(useDb(), readId(event)));
