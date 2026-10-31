/**
 * Product images in Shopify (stage 3b, G2). Order and alt texts are kept in
 * Shopify; the dashboard lists, stages and attaches.
 */

import { and, eq, isNull } from 'drizzle-orm';
import { ImageUploadError, assertStagedResource, checkImageUpload, variantsOfColor, type ImageUploadMeta } from '@roslett/core';
import { schema, type useDb } from '../db/client.js';
import type { ShopifyImage, ShopifyImageAssigned, ShopifyImageAttached, ShopifyStagedUpload } from '../../shared/types/api.js';
import { badRequest, conflict } from './errors.js';
import { shopifyGraphql } from './shopify.js';

type Db = ReturnType<typeof useDb>;

interface UserErrors {
  userErrors: { field: string[] | null; message: string }[];
}

async function linkedProductId(db: Db, productId: string): Promise<string> {
  const product = await db.query.products.findFirst({
    where: eq(schema.products.id, productId),
    columns: { shopifyProductId: true },
  });
  if (product === undefined) throw badRequest('Das Produkt gibt es nicht.');
  if (product.shopifyProductId === null) {
    throw conflict('Das Produkt ist noch nicht in Shopify. Bitte zuerst „Nach Shopify übertragen“.');
  }
  return product.shopifyProductId;
}

function guard<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof ImageUploadError) throw badRequest(error.message);
    throw error;
  }
}

interface MediaNode {
  id: string;
  alt: string | null;
  status: string;
  preview: { image: { url: string } | null } | null;
}

interface MediaProduct {
  media: { nodes: MediaNode[] };
  variants: { nodes: { selectedOptions: { name: string; value: string }[]; media: { nodes: { id: string }[] } }[] };
}

const MEDIA_FIELDS = `media(first: 50) { nodes { id alt status preview { image { url(transform: { maxWidth: 400 }) } } } }
  variants(first: 100) { nodes { selectedOptions { name value } media(first: 1) { nodes { id } } } }`;

/** Images with the colours whose variants show them (option "Farbe" from 3a). */
function toImages(product: MediaProduct | null): ShopifyImage[] {
  const colors = new Map<string, Set<string>>();
  for (const variant of product?.variants.nodes ?? []) {
    const color = variant.selectedOptions.find((o) => o.name === 'Farbe')?.value;
    const mediaId = variant.media.nodes[0]?.id;
    if (color && mediaId) colors.set(mediaId, (colors.get(mediaId) ?? new Set()).add(color));
  }
  return (product?.media.nodes ?? []).map((m) => ({
    id: m.id,
    alt: m.alt,
    status: m.status,
    url: m.preview?.image?.url ?? null,
    colors: [...(colors.get(m.id) ?? [])],
  }));
}

async function readMedia(shopifyProductId: string): Promise<MediaProduct | null> {
  const data = await shopifyGraphql<{ product: MediaProduct | null }>(
    `query Media($id: ID!) { product(id: $id) { ${MEDIA_FIELDS} } }`,
    { id: shopifyProductId },
  );
  return data.product;
}

export async function listImages(db: Db, productId: string): Promise<ShopifyImage[]> {
  return toImages(await readMedia(await linkedProductId(db, productId)));
}

/** Upload target for one file; the browser posts the file there itself. */
export async function stageImage(db: Db, productId: string, file: ImageUploadMeta): Promise<ShopifyStagedUpload> {
  await linkedProductId(db, productId);
  guard(() => checkImageUpload(file));
  const data = await shopifyGraphql<{
    stagedUploadsCreate: UserErrors & {
      stagedTargets: { url: string; resourceUrl: string; parameters: { name: string; value: string }[] }[];
    };
  }>(
    `mutation Stage($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } userErrors { field message } }
    }`,
    {
      input: [
        { resource: 'IMAGE', filename: file.filename, mimeType: file.mimeType, fileSize: String(file.fileSize), httpMethod: 'POST' },
      ],
    },
  );
  const target = data.stagedUploadsCreate.stagedTargets[0];
  if (data.stagedUploadsCreate.userErrors.length > 0 || target === undefined) {
    throw badRequest(`Shopify hat den Upload abgelehnt: ${data.stagedUploadsCreate.userErrors.map((e) => e.message).join('; ')}`);
  }
  return target;
}

/** Attaches an uploaded file to the product; Shopify processes it asynchronously. */
export async function attachImage(
  db: Db,
  productId: string,
  resourceUrl: string,
  alt: string | null,
): Promise<ShopifyImageAttached> {
  const id = await linkedProductId(db, productId);
  guard(() => assertStagedResource(resourceUrl));
  const before = new Set((await readMedia(id))?.media.nodes.map((m) => m.id));

  const data = await shopifyGraphql<{ productUpdate: UserErrors & { product: MediaProduct | null } }>(
    `mutation Attach($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
      productUpdate(product: $product, media: $media) { product { ${MEDIA_FIELDS} } userErrors { field message } }
    }`,
    { product: { id }, media: [{ originalSource: resourceUrl, mediaContentType: 'IMAGE', ...(alt ? { alt } : {}) }] },
  );
  if (data.productUpdate.userErrors.length > 0) {
    throw badRequest(`Shopify hat das Bild abgelehnt: ${data.productUpdate.userErrors.map((e) => e.message).join('; ')}`);
  }
  const mediaId = data.productUpdate.product?.media.nodes.find((m) => !before.has(m.id))?.id ?? null;
  return { mediaId, images: toImages(data.productUpdate.product) };
}

/**
 * Makes an image the picture of every variant of a colour. Shopify accepts
 * this only once the image is processed, so the browser asks again while
 * `ready` is false instead of the server waiting (function time limit).
 */
export async function assignImageToColor(
  db: Db,
  productId: string,
  mediaId: string,
  colorId: string,
): Promise<ShopifyImageAssigned> {
  const id = await linkedProductId(db, productId);
  const variants = await db.query.variants.findMany({
    where: and(eq(schema.variants.productId, productId), isNull(schema.variants.archivedAt)),
    columns: { colorId: true, shopifyVariantId: true },
  });
  const variantIds = guard(() => variantsOfColor(variants, colorId));

  const media = (await readMedia(id))?.media.nodes.find((m) => m.id === mediaId);
  if (media === undefined) throw badRequest('Das Bild gehört nicht zu diesem Produkt.');
  if (media.status === 'FAILED') throw badRequest('Shopify konnte das Bild nicht verarbeiten.');
  if (media.status !== 'READY') return { ready: false, images: [] };

  const data = await shopifyGraphql<{ productVariantAppendMedia: UserErrors }>(
    `mutation Variants($productId: ID!, $variantMedia: [ProductVariantAppendMediaInput!]!) {
      productVariantAppendMedia(productId: $productId, variantMedia: $variantMedia) { userErrors { field message } }
    }`,
    { productId: id, variantMedia: variantIds.map((variantId) => ({ variantId, mediaIds: [mediaId] })) },
  );
  if (data.productVariantAppendMedia.userErrors.length > 0) {
    throw badRequest(`Shopify hat die Zuordnung abgelehnt: ${data.productVariantAppendMedia.userErrors.map((e) => e.message).join('; ')}`);
  }
  return { ready: true, images: await listImages(db, productId) };
}
