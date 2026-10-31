import { useDb } from '../../db/client.js';
import type { ShopifyStockChangesPreview } from '../../../shared/types/api.js';
import { stockChangesPreview } from '../../utils/shopify-inventory.js';

/** Stage 4 preview: stock changes Shopify does not know about yet; writes nothing. */
export default defineEventHandler((): Promise<ShopifyStockChangesPreview> => stockChangesPreview(useDb()));
