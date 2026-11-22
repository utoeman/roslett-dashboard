/**
 * Product images in Shopify (stage 3b, G2, G34, G35). Order is kept in
 * Shopify; the dashboard lists, stages, attaches, sets colours and deletes.
 * A photo's colour lives in its alt text, so several photos can share one.
 */

import { and, eq, isNull } from 'drizzle-orm';
import {
  ImageUploadError,
  altWithColor,
  assertStagedResource,
  checkImageUpload,
  colorFromAlt,
  planVariantImages,
  variantsOfColor,
  type ImageUploadMeta,
} from '@roslett/core';
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
  variants: {
    nodes: { id: string; selectedOptions: { name: string; value: string }[]; media: { nodes: { id: string }[] } }[];
  };
}

const MEDIA_FIELDS = `media(first: 50) { nodes { id alt status preview { image { url(transform: { maxWidth: 400 }) } } } }
  variants(first: 100) { nodes { id selectedOptions { name value } media(first: 1) { nodes { id } } } }`;

/** Value of the option "Farbe" (from 3a), null for products without colours. */
function variantColor(variant: MediaProduct['variants']['nodes'][number]): string | null {
  return variant.selectedOptions.find((o) => o.name === 'Farbe')?.value ?? null;
}

function colorNamesOf(product: MediaProduct | null): string[] {
  return [...new Set((product?.variants.nodes ?? []).flatMap((v) => variantColor(v) ?? []))];
}

/** Images with their colour from the alt text (G35) and whether a variant shows them. */
function toImages(product: MediaProduct | null): ShopifyImage[] {
  const colorNames = colorNamesOf(product);
  const variantImages = new Set((product?.variants.nodes ?? []).flatMap((v) => v.media.nodes[0]?.id ?? []));
  return (product?.media.nodes ?? []).map((m) => ({
    id: m.id,
    alt: m.alt,
    status: m.status,
    url: m.preview?.image?.url ?? null,
    color: colorFromAlt(m.alt, colorNames),
    variantImage: variantImages.has(m.id),
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
 * Brings the variant pictures in line with the gallery (G35): each colour shows
 * its first photo. `pending` while that photo is still processing.
 */
async function syncVariantImages(shopifyProductId: string, product: MediaProduct | null, gallery: MediaNode[]): Promise<boolean> {
  const colorNames = colorNamesOf(product);
  const plan = planVariantImages(
    (product?.variants.nodes ?? []).map((v) => ({
      variantId: v.id,
      colorName: variantColor(v),
      mediaId: v.media.nodes[0]?.id ?? null,
    })),
    gallery.map((m) => ({ mediaId: m.id, colorName: colorFromAlt(m.alt, colorNames), ready: m.status === 'READY' })),
  );
  if (plan.detach.length > 0) {
    const data = await shopifyGraphql<{ productVariantDetachMedia: UserErrors }>(
      `mutation Detach($productId: ID!, $variantMedia: [ProductVariantDetachMediaInput!]!) {
        productVariantDetachMedia(productId: $productId, variantMedia: $variantMedia) { userErrors { field message } }
      }`,
      { productId: shopifyProductId, variantMedia: plan.detach.map((d) => ({ variantId: d.variantId, mediaIds: [d.mediaId] })) },
    );
    if (data.productVariantDetachMedia.userErrors.length > 0) {
      throw badRequest(`Shopify hat das Lösen abgelehnt: ${data.productVariantDetachMedia.userErrors.map((e) => e.message).join('; ')}`);
    }
  }
  if (plan.append.length > 0) {
    const data = await shopifyGraphql<{ productVariantAppendMedia: UserErrors }>(
      `mutation Variants($productId: ID!, $variantMedia: [ProductVariantAppendMediaInput!]!) {
        productVariantAppendMedia(productId: $productId, variantMedia: $variantMedia) { userErrors { field message } }
      }`,
      { productId: shopifyProductId, variantMedia: plan.append.map((a) => ({ variantId: a.variantId, mediaIds: [a.mediaId] })) },
    );
    if (data.productVariantAppendMedia.userErrors.length > 0) {
      throw badRequest(`Shopify hat die Zuordnung abgelehnt: ${data.productVariantAppendMedia.userErrors.map((e) => e.message).join('; ')}`);
    }
  }
  return plan.pending;
}

/**
 * Sets a photo's colour (null = none) in its alt text, then lines up the
 * variant pictures. Shopify edits only processed images, so the browser asks
 * again while `ready` is false instead of the server waiting (function time limit).
 */
export async function setImageColor(
  db: Db,
  productId: string,
  mediaId: string,
  colorId: string | null,
): Promise<ShopifyImageAssigned> {
  const id = await linkedProductId(db, productId);
  let colorName: string | null = null;
  if (colorId !== null) {
    const variants = await db.query.variants.findMany({
      where: and(eq(schema.variants.productId, productId), isNull(schema.variants.archivedAt)),
      columns: { colorId: true, shopifyVariantId: true },
    });
    guard(() => variantsOfColor(variants, colorId));
    const color = await db.query.colors.findFirst({ where: eq(schema.colors.id, colorId), columns: { name: true } });
    if (color === undefined) throw badRequest('Die Farbe gibt es nicht.');
    colorName = color.name;
  }

  const product = await readMedia(id);
  const media = product?.media.nodes.find((m) => m.id === mediaId);
  if (media === undefined) throw badRequest('Das Bild gehört nicht zu diesem Produkt.');
  if (media.status === 'FAILED') throw badRequest('Shopify konnte das Bild nicht verarbeiten.');
  if (media.status !== 'READY') return { ready: false, images: [] };

  const name = (await db.query.products.findFirst({ where: eq(schema.products.id, productId), columns: { name: true } }))?.name ?? '';
  const alt = altWithColor(media.alt, name, colorNamesOf(product), colorName);
  if (alt !== media.alt) {
    const data = await shopifyGraphql<{ fileUpdate: UserErrors }>(
      `mutation Alt($files: [FileUpdateInput!]!) { fileUpdate(files: $files) { files { id } userErrors { field message } } }`,
      { files: [{ id: mediaId, alt }] },
    );
    if (data.fileUpdate.userErrors.length > 0) {
      throw badRequest(`Shopify hat den Alt-Text abgelehnt: ${data.fileUpdate.userErrors.map((e) => e.message).join('; ')}`);
    }
  }
  const gallery = (product?.media.nodes ?? []).map((m) => (m.id === mediaId ? { ...m, alt } : m));
  const pending = await syncVariantImages(id, product, gallery);
  return { ready: !pending, images: await listImages(db, productId) };
}

/**
 * Deletes the image in Shopify for good, so it also leaves the shop (G34).
 * Variant pictures move on to the next photo of their colour first.
 */
export async function deleteImage(db: Db, productId: string, mediaId: string): Promise<ShopifyImage[]> {
  const id = await linkedProductId(db, productId);
  const product = await readMedia(id);
  if (!product?.media.nodes.some((m) => m.id === mediaId)) throw badRequest('Das Bild gehört nicht zu diesem Produkt.');
  await syncVariantImages(
    id,
    product,
    product.media.nodes.filter((m) => m.id !== mediaId),
  );

  const data = await shopifyGraphql<{ fileDelete: UserErrors }>(
    `mutation Delete($fileIds: [ID!]!) { fileDelete(fileIds: $fileIds) { deletedFileIds userErrors { field message } } }`,
    { fileIds: [mediaId] },
  );
  if (data.fileDelete.userErrors.length > 0) {
    throw badRequest(`Shopify hat das Löschen abgelehnt: ${data.fileDelete.userErrors.map((e) => e.message).join('; ')}`);
  }
  // Deletion runs asynchronously in Shopify; the list must not show the image again.
  return (await listImages(db, productId)).filter((image) => image.id !== mediaId);
}
