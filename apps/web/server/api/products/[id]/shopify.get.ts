import { useDb } from '../../../db/client.js';
import type { ShopifyProductPreview } from '../../../../shared/types/api.js';
import { readId } from '../../../utils/validation.js';
import { productShopifyPreview } from '../../../utils/shopify-products.js';

/** Preview: what a push would change in Shopify, field by field; writes nothing. */
export default defineEventHandler((event): Promise<ShopifyProductPreview> => productShopifyPreview(useDb(), readId(event)));
