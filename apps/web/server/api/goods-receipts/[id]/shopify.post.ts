import { z } from 'zod';
import { useDb } from '../../../db/client.js';
import type { ReceiptShopifyPushResult } from '../../../../shared/types/api.js';
import { readId, readJsonBody } from '../../../utils/validation.js';
import { pushReceiptToShopify } from '../../../utils/shopify-inventory.js';

const bodySchema = z.object({ locationId: z.string().min(1).nullable().default(null) });

/** Sends the receipt's open entries to Shopify as `+quantity` (G16). */
export default defineEventHandler(async (event): Promise<ReceiptShopifyPushResult> => {
  const id = readId(event);
  const { locationId } = await readJsonBody(event, bodySchema);
  return pushReceiptToShopify(useDb(), id, locationId);
});
