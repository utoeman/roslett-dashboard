/**
 * Product images (stage 3b, G2): the browser uploads straight to Shopify's
 * staged upload storage; the dashboard only checks the file and attaches the
 * uploaded resource. No image is stored in the dashboard.
 */

export class ImageUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageUploadError';
  }
}

/** Shopify's limit for product images. */
const MAX_BYTES = 20 * 1024 * 1024;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const STAGED_HOST = 'shopify-staged-uploads.storage.googleapis.com';

export interface ImageUploadMeta {
  filename: string;
  mimeType: string;
  fileSize: number;
}

export function checkImageUpload(file: ImageUploadMeta): void {
  if (!TYPES.has(file.mimeType)) {
    throw new ImageUploadError(`${file.filename}: nur JPEG, PNG, WebP oder GIF.`);
  }
  if (!Number.isInteger(file.fileSize) || file.fileSize <= 0) throw new ImageUploadError(`${file.filename}: Datei ist leer.`);
  if (file.fileSize > MAX_BYTES) throw new ImageUploadError(`${file.filename}: höchstens 20 MB.`);
}

/** Only resources from Shopify's own upload storage may be attached, never arbitrary URLs. */
export function assertStagedResource(resourceUrl: string): void {
  let url: URL;
  try {
    url = new URL(resourceUrl);
  } catch {
    throw new ImageUploadError('Ungültige Upload-Adresse.');
  }
  if (url.protocol !== 'https:' || url.hostname !== STAGED_HOST) {
    throw new ImageUploadError('Die Upload-Adresse stammt nicht von Shopify.');
  }
}

/**
 * A colour photo belongs to every variant of that colour, across all sizes.
 * Shopify shows one image per variant, so the colour switch on the shop page
 * changes the picture.
 */
export function variantsOfColor(
  variants: readonly { colorId: string | null; shopifyVariantId: string | null }[],
  colorId: string,
): string[] {
  const ids = variants.flatMap((v) => (v.colorId === colorId && v.shopifyVariantId ? [v.shopifyVariantId] : []));
  if (ids.length === 0) {
    throw new ImageUploadError('Zu dieser Farbe gibt es keine Variante in Shopify. Bitte zuerst „Nach Shopify übertragen“.');
  }
  return ids;
}

export interface VariantMedia {
  variantId: string;
  /** The variant's picture in Shopify, null if it has none. */
  mediaId: string | null;
}

export interface VariantMediaPlan {
  detach: { variantId: string; mediaId: string }[];
  append: string[];
}

/**
 * Steps to make `mediaId` the picture of exactly `targetVariantIds`. A variant
 * holds one picture, so a target's old picture is detached first.
 */
export function planVariantMedia(
  current: readonly VariantMedia[],
  targetVariantIds: readonly string[],
  mediaId: string,
): VariantMediaPlan {
  const targets = new Set(targetVariantIds);
  const shown = new Map(current.map((v) => [v.variantId, v.mediaId]));
  const detach: VariantMediaPlan['detach'] = [];
  for (const v of current) {
    if (v.mediaId === null) continue;
    if (targets.has(v.variantId) ? v.mediaId !== mediaId : v.mediaId === mediaId) {
      detach.push({ variantId: v.variantId, mediaId: v.mediaId });
    }
  }
  const append = [...targets].filter((variantId) => shown.get(variantId) !== mediaId);
  return { detach, append };
}
