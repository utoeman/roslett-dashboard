/** Loading products and building variant rows with generated SKUs. */

import { asc, eq, inArray } from 'drizzle-orm';
import { SkuError, buildSku } from '@roslett/core';
import type { useDb } from '../db/client.js';
import { schema } from '../db/client.js';
import type { CreateVariant } from '../../shared/schemas/product.js';
import { badRequest } from './errors.js';
import { centsToNumeric } from './money.js';
import { mapProduct } from './mapping.js';

type Db = Pick<ReturnType<typeof useDb>, 'query'>;

export async function loadProduct(db: Db, id: string, options: { includeArchivedVariants?: boolean } = {}) {
  const product = await db.query.products.findFirst({
    where: eq(schema.products.id, id),
    with: {
      category: true,
      variants: {
        where: options.includeArchivedVariants === false ? (v, { isNull }) => isNull(v.archivedAt) : undefined,
        orderBy: [asc(schema.variants.sku)],
        with: { color: true },
      },
    },
  });
  return product ? mapProduct(product) : undefined;
}

/**
 * Validates colors and builds insertable rows with generated SKUs. `path` is
 * the request field ("variants" or "newVariants") for per-field errors.
 */
export async function buildVariantRows(
  db: Db,
  product: { id: string; number: number },
  categoryCode: string,
  variants: readonly CreateVariant[],
  path: string,
) {
  const colorIds = [...new Set(variants.map((v) => v.colorId).filter((id): id is string => Boolean(id)))];
  const colors =
    colorIds.length > 0 ? await db.query.colors.findMany({ where: inArray(schema.colors.id, colorIds) }) : [];
  const colorsById = new Map(colors.map((color) => [color.id, color]));

  const seen = new Set<string>();
  return variants.map((variant, index) => {
    let colorCode: string | null = null;
    if (variant.colorId) {
      const color = colorsById.get(variant.colorId);
      if (color === undefined || color.archivedAt !== null) {
        throw badRequest('Die gewählte Farbe gibt es nicht oder sie ist archiviert.', {
          [`${path}.${index}.colorId`]: 'Farbe nicht verfügbar.',
        });
      }
      colorCode = color.code;
    }

    let sku: string;
    try {
      sku = buildSku({ categoryCode, productNumber: product.number, colorCode, size: variant.size });
    } catch (error) {
      if (error instanceof SkuError) {
        throw badRequest(error.message, { [`${path}.${index}.size`]: error.message });
      }
      throw error;
    }
    if (seen.has(sku)) {
      throw badRequest('Diese Kombination aus Farbe und Größe kommt doppelt vor.', {
        [`${path}.${index}.size`]: 'Doppelt.',
      });
    }
    seen.add(sku);

    return {
      productId: product.id,
      colorId: variant.colorId ?? null,
      size: variant.size ?? null,
      sku,
      priceGross: centsToNumeric(variant.priceGross ?? null),
      minimumStock: variant.minimumStock ?? 0,
      fiber: variant.fiber ?? null,
      fiberFilling: variant.fiberFilling ?? null,
      originCountry: variant.originCountry ?? null,
      hsCode: variant.hsCode ?? null,
    };
  });
}
