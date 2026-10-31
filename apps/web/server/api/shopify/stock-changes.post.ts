import { z } from 'zod';
import { useDb } from '../../db/client.js';
import type { ReceiptShopifyPushResult } from '../../../shared/types/api.js';
import { readJsonBody } from '../../utils/validation.js';
import { pushStockChanges } from '../../utils/shopify-inventory.js';

const bodySchema = z.object({ locationId: z.string().min(1).nullable().default(null) });

/** Sends all open stock changes as relative adjustments, each entry once. */
export default defineEventHandler(async (event): Promise<ReceiptShopifyPushResult> => {
  const { locationId } = await readJsonBody(event, bodySchema);
  return pushStockChanges(useDb(), locationId);
});
