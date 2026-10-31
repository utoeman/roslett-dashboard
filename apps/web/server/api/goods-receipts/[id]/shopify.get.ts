import { useDb } from '../../../db/client.js';
import type { ReceiptShopifyPreview } from '../../../../shared/types/api.js';
import { readId } from '../../../utils/validation.js';
import { receiptShopifyPreview } from '../../../utils/shopify-inventory.js';

/** Preview of the stock change in Shopify; writes nothing. */
export default defineEventHandler((event): Promise<ReceiptShopifyPreview> => receiptShopifyPreview(useDb(), readId(event)));
