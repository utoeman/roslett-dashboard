import { z } from 'zod';
import { useDb } from '../../../../db/client.js';
import { uuidSchema } from '../../../../../shared/schemas/common.js';
import type { ShopifyImageAssigned } from '../../../../../shared/types/api.js';
import { readId, readJsonBody } from '../../../../utils/validation.js';
import { setImageColors } from '../../../../utils/shopify-images.js';

const bodySchema = z.object({
  mediaId: z.string().trim().min(1).max(200),
  colorIds: z.array(uuidSchema).max(50),
});

/** The image becomes the picture of all variants of these colours (empty = none); `ready: false` = ask again. */
export default defineEventHandler(async (event): Promise<ShopifyImageAssigned> => {
  const id = readId(event);
  const { mediaId, colorIds } = await readJsonBody(event, bodySchema);
  return setImageColors(useDb(), id, mediaId, colorIds);
});
