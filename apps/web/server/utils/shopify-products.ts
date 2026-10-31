/**
 * Product push (stage 3a): build the `productSet` input from the dashboard,
 * compare it with Shopify for the preview, then write it and store the IDs.
 */

import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import {
  ProductPushError,
  buildProductSet,
  diffProductSet,
  type ProductSetInput,
  type ProductStatus,
} from '@roslett/core';
import { schema, type useDb } from '../db/client.js';
import type { ShopifyProductPreview, ShopifyProductPushResult } from '../../shared/types/api.js';
import { badRequest } from './errors.js';
import { numericToCents } from './money.js';
import { shopifyGraphql } from './shopify.js';

type Db = ReturnType<typeof useDb>;
type Reader = Pick<Db, 'select' | 'query'>;

interface ShopifyProductNode {
  id: string;
  title: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  category: { id: string; fullName: string } | null;
  status: ProductStatus;
  options: { name: string; optionValues: { name: string }[] }[];
  metafields: { nodes: { key: string; type: string; value: string }[] };
  variants: {
    nodes: {
      id: string;
      sku: string | null;
      price: string;
      taxable: boolean;
      selectedOptions: { name: string; value: string }[];
      inventoryItem: {
        tracked: boolean;
        requiresShipping: boolean;
        harmonizedSystemCode: string | null;
        countryCodeOfOrigin: string | null;
        measurement: { weight: { value: number; unit: string } | null } | null;
      };
      metafields: { nodes: { key: string; type: string; value: string }[] };
    }[];
  };
}

const PRODUCT_FIELDS = `id title descriptionHtml vendor productType status category { id fullName }
  options { name optionValues { name } }
  metafields(namespace: "custom", first: 20) { nodes { key type value } }
  variants(first: 100) { nodes {
    id sku price taxable selectedOptions { name value }
    inventoryItem { tracked requiresShipping harmonizedSystemCode countryCodeOfOrigin measurement { weight { value unit } } }
    metafields(namespace: "custom", first: 10) { nodes { key type value } }
  } }`;

const metafield = (m: { key: string; type: string; value: string }) => ({ namespace: 'custom', ...m });

const GRAMS_PER_UNIT: Record<string, number> = { GRAMS: 1, KILOGRAMS: 1000, OUNCES: 28.3495, POUNDS: 453.592 };

/** Shopify stores weight in its own unit; the dashboard compares whole grams. */
function toGrams(weight: { value: number; unit: string } | null | undefined): number {
  return weight ? Math.round(weight.value * (GRAMS_PER_UNIT[weight.unit] ?? 1)) : 0;
}

/** Shopify's product in the same shape as the input, so both can be diffed. */
function toInput(node: ShopifyProductNode): ProductSetInput {
  return {
    id: node.id,
    title: node.title,
    descriptionHtml: node.descriptionHtml,
    vendor: node.vendor,
    productType: node.productType,
    ...(node.category ? { category: node.category.id } : {}),
    status: node.status,
    productOptions: node.options.map((o) => ({ name: o.name, values: o.optionValues.map((v) => ({ name: v.name })) })),
    metafields: node.metafields.nodes.map(metafield),
    variants: node.variants.nodes.map((v) => ({
      id: v.id,
      sku: v.sku ?? '',
      price: v.price,
      taxable: v.taxable,
      optionValues: v.selectedOptions.map((o) => ({ optionName: o.name, name: o.value })),
      inventoryItem: {
        tracked: v.inventoryItem.tracked,
        requiresShipping: v.inventoryItem.requiresShipping,
        harmonizedSystemCode: v.inventoryItem.harmonizedSystemCode,
        countryCodeOfOrigin: v.inventoryItem.countryCodeOfOrigin,
        measurement: { weight: { value: toGrams(v.inventoryItem.measurement?.weight), unit: 'GRAMS' as const } },
      },
      metafields: v.metafields.nodes.map(metafield),
    })),
  };
}

async function loadProduct(db: Reader, productId: string) {
  const row = await db.query.products.findFirst({
    where: eq(schema.products.id, productId),
    with: {
      category: true,
      variants: { where: isNull(schema.variants.archivedAt), orderBy: (v, { asc }) => [asc(v.sku)], with: { color: true } },
    },
  });
  if (row === undefined) throw badRequest('Das Produkt gibt es nicht.');
  const [manufacturer] = await db.select().from(schema.companySettings).limit(1);
  const basePrice = numericToCents(row.basePriceGross);
  try {
    const { input, warnings } = buildProductSet(
      {
        number: row.number,
        name: row.name,
        description: row.description,
        categoryName: row.category.name,
        textile: row.category.group === 'textile',
        careNotes: row.careNotes,
        safetyNotes: row.safetyNotes,
        archived: row.archivedAt !== null,
        shopifyProductId: row.shopifyProductId,
        shopifyCategoryId: row.category.shopifyCategoryId,
        variants: row.variants.map((v) => ({
          sku: v.sku,
          colorName: v.color?.name ?? null,
          size: v.size,
          priceGross: numericToCents(v.priceGross) ?? basePrice,
          fiber: v.fiber,
          fiberFilling: v.fiberFilling,
          hsCode: v.hsCode,
          originCountry: v.originCountry,
          weightGrams: v.weightGrams,
          shopifyVariantId: v.shopifyVariantId,
        })),
      },
      manufacturer
        ? { name: manufacturer.manufacturerName, address: manufacturer.manufacturerAddress, email: manufacturer.manufacturerEmail }
        : null,
    );
    return { row, input, warnings };
  } catch (error) {
    if (error instanceof ProductPushError) throw badRequest(error.message);
    throw error;
  }
}

/** Hash of what the dashboard would send, without Shopify IDs; equal hash = nothing changed since the last push. */
function pushHash(input: ProductSetInput): string {
  // Handle and draft status are only sent on create; leaving them out keeps the hash equal afterwards.
  const { id: _id, handle: _handle, status, ...rest } = input;
  const variants = rest.variants.map(({ id: _variantId, ...v }) => v);
  return createHash('sha256')
    .update(JSON.stringify({ ...rest, archived: status === 'ARCHIVED', variants }))
    .digest('hex');
}

/** Current Shopify product; unlinked products are looked up by handle so none is created twice. */
async function currentProduct(input: ProductSetInput): Promise<ShopifyProductNode | null> {
  if (input.id) {
    const data = await shopifyGraphql<{ product: ShopifyProductNode | null }>(
      `query Product($id: ID!) { product(id: $id) { ${PRODUCT_FIELDS} } }`,
      { id: input.id },
    );
    return data.product;
  }
  const data = await shopifyGraphql<{ productByIdentifier: ShopifyProductNode | null }>(
    `query ByHandle($handle: String!) { productByIdentifier(identifier: { handle: $handle }) { ${PRODUCT_FIELDS} } }`,
    { handle: input.handle },
  );
  if (data.productByIdentifier) {
    throw badRequest('In Shopify gibt es schon ein Produkt mit diesem Handle. Bitte zuerst auf der Seite „Shopify“ verknüpfen.');
  }
  return null;
}

/** Variants already in Shopify keep their ID (matched by SKU) instead of being recreated. */
function withVariantIds(input: ProductSetInput, current: ShopifyProductNode | null): ProductSetInput {
  if (current === null) return input;
  const bySku = new Map(current.variants.nodes.map((v) => [v.sku ?? '', v.id]));
  return {
    ...input,
    variants: input.variants.map((v) => {
      const id = v.id ?? bySku.get(v.sku);
      return id ? { ...v, id } : v;
    }),
  };
}

export async function productShopifyPreview(db: Db, productId: string): Promise<ShopifyProductPreview> {
  const { row, input, warnings } = await loadProduct(db, productId);
  const current = await currentProduct(input);
  const diff = diffProductSet(withVariantIds(input, current), current ? toInput(current) : null);
  // The diff compares taxonomy IDs; the preview shows their names.
  const categoryNames = new Map<string, string>([
    ...(row.category.shopifyCategoryId && row.category.shopifyCategoryName
      ? [[row.category.shopifyCategoryId, row.category.shopifyCategoryName] as const]
      : []),
    ...(current?.category ? [[current.category.id, current.category.fullName] as const] : []),
  ]);
  const named = (value: string | null) => (value === null ? null : (categoryNames.get(value) ?? value));
  diff.changes = diff.changes.map((c) =>
    c.field === 'Shopify-Kategorie' ? { ...c, from: named(c.from), to: named(c.to) } : c,
  );
  return {
    isNew: current === null,
    pushedAt: row.shopifyPushedAt?.toISOString() ?? null,
    changedSincePush: row.shopifyPushHash !== pushHash(input),
    changes: diff.changes,
    removedVariants: diff.removedVariants,
    warnings,
  };
}

export async function pushProductToShopify(db: Db, productId: string): Promise<ShopifyProductPushResult> {
  const { row, input, warnings } = await loadProduct(db, productId);
  const current = await currentProduct(input);
  const payload = withVariantIds(input, current);

  const data = await shopifyGraphql<{
    productSet: {
      product: { id: string; variants: { nodes: { id: string; sku: string | null; inventoryItem: { id: string } }[] } } | null;
      userErrors: { field: string[] | null; message: string }[];
    };
  }>(
    `mutation Push($input: ProductSetInput!) {
      productSet(input: $input, synchronous: true) {
        product { id variants(first: 100) { nodes { id sku inventoryItem { id } } } }
        userErrors { field message }
      }
    }`,
    { input: payload },
  );
  const { product, userErrors } = data.productSet;
  if (userErrors.length > 0 || product === null) {
    throw badRequest(`Shopify hat das Produkt abgelehnt: ${userErrors.map((e) => e.message).join('; ') || 'ohne Begründung'}`);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schema.products)
      .set({ shopifyProductId: product.id, shopifyPushedAt: new Date(), shopifyPushHash: pushHash(input) })
      .where(eq(schema.products.id, row.id));
    for (const variant of product.variants.nodes) {
      if (!variant.sku) continue;
      // A Shopify variant may have sat under another SKU before; release its ID first (unique index).
      await tx
        .update(schema.variants)
        .set({ shopifyVariantId: null, shopifyInventoryItemId: null })
        .where(eq(schema.variants.shopifyVariantId, variant.id));
      await tx
        .update(schema.variants)
        .set({ shopifyVariantId: variant.id, shopifyInventoryItemId: variant.inventoryItem.id })
        .where(and(eq(schema.variants.productId, row.id), eq(schema.variants.sku, variant.sku)));
    }
  });
  return { productId: product.id, variants: product.variants.nodes.length, warnings };
}
