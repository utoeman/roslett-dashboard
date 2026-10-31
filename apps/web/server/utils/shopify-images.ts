/**
 * Product images in Shopify (stage 3b, G2). Order and alt texts are kept in
 * Shopify; the dashboard lists, stages and attaches.
 */

import { eq } from 'drizzle-orm';
import { ImageUploadError, assertStagedResource, checkImageUpload, type ImageUploadMeta } from '@roslett/core';
import { schema, type useDb } from '../db/client.js';
import type { ShopifyImage, ShopifyStagedUpload } from '../../shared/types/api.js';
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

export async function listImages(db: Db, productId: string): Promise<ShopifyImage[]> {
  const id = await linkedProductId(db, productId);
  const data = await shopifyGraphql<{
    product: { media: { nodes: { id: string; alt: string | null; status: string; preview: { image: { url: string } | null } | null }[] } } | null;
  }>(
    `query Media($id: ID!) {
      product(id: $id) { media(first: 50) { nodes { id alt status preview { image { url(transform: { maxWidth: 400 }) } } } } }
    }`,
    { id },
  );
  return (data.product?.media.nodes ?? []).map((m) => ({
    id: m.id,
    alt: m.alt,
    status: m.status,
    url: m.preview?.image?.url ?? null,
  }));
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
export async function attachImage(db: Db, productId: string, resourceUrl: string, alt: string | null): Promise<ShopifyImage[]> {
  const id = await linkedProductId(db, productId);
  guard(() => assertStagedResource(resourceUrl));
  const data = await shopifyGraphql<{ productUpdate: UserErrors }>(
    `mutation Attach($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
      productUpdate(product: $product, media: $media) { userErrors { field message } }
    }`,
    { product: { id }, media: [{ originalSource: resourceUrl, mediaContentType: 'IMAGE', ...(alt ? { alt } : {}) }] },
  );
  if (data.productUpdate.userErrors.length > 0) {
    throw badRequest(`Shopify hat das Bild abgelehnt: ${data.productUpdate.userErrors.map((e) => e.message).join('; ')}`);
  }
  return listImages(db, productId);
}
