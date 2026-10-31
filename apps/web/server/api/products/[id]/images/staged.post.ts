import { z } from 'zod';
import { useDb } from '../../../../db/client.js';
import type { ShopifyStagedUpload } from '../../../../../shared/types/api.js';
import { readId, readJsonBody } from '../../../../utils/validation.js';
import { stageImage } from '../../../../utils/shopify-images.js';

const bodySchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(100),
  fileSize: z.coerce.number().int(),
});

/** Step 1 of an upload: a staged target the browser uploads to directly. */
export default defineEventHandler(async (event): Promise<ShopifyStagedUpload> => {
  const id = readId(event);
  const file = await readJsonBody(event, bodySchema);
  return stageImage(useDb(), id, file);
});
