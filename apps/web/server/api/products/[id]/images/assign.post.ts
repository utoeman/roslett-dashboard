import { z } from 'zod';
import { useDb } from '../../../../db/client.js';
import { uuidSchema } from '../../../../../shared/schemas/common.js';
import type { ShopifyImageAssigned } from '../../../../../shared/types/api.js';
import { readId, readJsonBody } from '../../../../utils/validation.js';
import { assignImageToColor } from '../../../../utils/shopify-images.js';

const bodySchema = z.object({
  mediaId: z.string().trim().min(1).max(200),
  colorId: uuidSchema,
});

/** Step 3 (optional): the image becomes the picture of all variants of a colour; `ready: false` = ask again. */
export default defineEventHandler(async (event): Promise<ShopifyImageAssigned> => {
  const id = readId(event);
  const { mediaId, colorId } = await readJsonBody(event, bodySchema);
  return assignImageToColor(useDb(), id, mediaId, colorId);
});
