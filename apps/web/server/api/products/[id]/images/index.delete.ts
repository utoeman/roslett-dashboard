import { z } from 'zod';
import { useDb } from '../../../../db/client.js';
import type { ShopifyImage } from '../../../../../shared/types/api.js';
import { readId, readJsonBody } from '../../../../utils/validation.js';
import { deleteImage } from '../../../../utils/shopify-images.js';

// Media IDs contain slashes, so they travel in the body instead of the path.
const bodySchema = z.object({
  mediaId: z.string().trim().min(1).max(200),
});

/** Deletes the image in Shopify for good (G34). */
export default defineEventHandler(async (event): Promise<ShopifyImage[]> => {
  const id = readId(event);
  const { mediaId } = await readJsonBody(event, bodySchema);
  return deleteImage(useDb(), id, mediaId);
});
