import { z } from 'zod';
import { useDb } from '../../../../db/client.js';
import type { ShopifyImage } from '../../../../../shared/types/api.js';
import { readId, readJsonBody } from '../../../../utils/validation.js';
import { attachImage } from '../../../../utils/shopify-images.js';

const bodySchema = z.object({
  resourceUrl: z.string().trim().min(1).max(2000),
  alt: z.string().trim().max(512).nullable().default(null),
});

/** Step 2 of an upload: attach the uploaded file to the Shopify product. */
export default defineEventHandler(async (event): Promise<ShopifyImage[]> => {
  const id = readId(event);
  const { resourceUrl, alt } = await readJsonBody(event, bodySchema);
  return attachImage(useDb(), id, resourceUrl, alt || null);
});
