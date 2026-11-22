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

/**
 * G35: a photo's colour is the text after the last comma of its alt text
 * ("Kissen Leinen, Senfgelb"). The shop theme filters the gallery by the same
 * rule, so the alt text is the single source.
 */
export function colorFromAlt(alt: string | null, colorNames: readonly string[]): string | null {
  if (alt === null) return null;
  const comma = alt.lastIndexOf(',');
  if (comma < 0) return null;
  const suffix = alt.slice(comma + 1).trim().toLocaleLowerCase('de');
  return colorNames.find((name) => name.toLocaleLowerCase('de') === suffix) ?? null;
}

/** Alt text with the new colour; text written in Shopify is kept, otherwise the product name. */
export function altWithColor(
  alt: string | null,
  productName: string,
  colorNames: readonly string[],
  colorName: string | null,
): string {
  const own = alt ?? '';
  const base = colorFromAlt(alt, colorNames) === null ? own : own.slice(0, own.lastIndexOf(','));
  const text = base.trim() || productName;
  return colorName ? `${text}, ${colorName}` : text;
}

export interface VariantImage {
  variantId: string;
  colorName: string | null;
  /** The variant's picture in Shopify, null if it has none. */
  mediaId: string | null;
}

export interface GalleryImage {
  mediaId: string;
  colorName: string | null;
  /** Shopify attaches only processed images to variants. */
  ready: boolean;
}

export interface VariantImagePlan {
  detach: { variantId: string; mediaId: string }[];
  append: { variantId: string; mediaId: string }[];
  /** A colour's first photo is still processing; ask again later. */
  pending: boolean;
}

/**
 * Shopify holds one picture per variant: it becomes the first photo of the
 * variant's colour in gallery order, across all sizes. Colours without a photo
 * lose their picture; variants without a colour stay as they are.
 */
export function planVariantImages(variants: readonly VariantImage[], gallery: readonly GalleryImage[]): VariantImagePlan {
  const plan: VariantImagePlan = { detach: [], append: [], pending: false };
  for (const variant of variants) {
    if (variant.colorName === null) continue;
    const first = gallery.find((image) => image.colorName === variant.colorName) ?? null;
    if (first?.mediaId === variant.mediaId) continue;
    if (first !== null && !first.ready) {
      plan.pending = true;
      continue;
    }
    if (variant.mediaId !== null) plan.detach.push({ variantId: variant.variantId, mediaId: variant.mediaId });
    if (first !== null) plan.append.push({ variantId: variant.variantId, mediaId: first.mediaId });
  }
  return plan;
}
