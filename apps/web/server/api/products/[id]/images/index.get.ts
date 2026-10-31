import { useDb } from '../../../../db/client.js';
import type { ShopifyImage } from '../../../../../shared/types/api.js';
import { readId } from '../../../../utils/validation.js';
import { listImages } from '../../../../utils/shopify-images.js';

/** Images of the product as Shopify has them (order and alt texts are kept there). */
export default defineEventHandler((event): Promise<ShopifyImage[]> => listImages(useDb(), readId(event)));
