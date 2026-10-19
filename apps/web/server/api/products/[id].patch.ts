import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema, useDb } from '../../db/client.js';
import {
  createVariantSchema,
  updateProductSchema,
  updateVariantSchema,
} from '../../../shared/schemas/product.js';
import { readJsonBody, readId, requireFound } from '../../utils/validation.js';
import { badRequest, databaseError } from '../../utils/errors.js';
import { centsToNumeric } from '../../utils/money.js';
import { buildVariantRows, loadProduct } from '../../utils/products.js';

/** Product fields and variant changes in one call, so the form saves atomically. */
const bodySchema = updateProductSchema.extend({
  newVariants: z.array(createVariantSchema).optional(),
  updatedVariants: z.array(updateVariantSchema).optional(),
});

/**
 * Updates a product in one transaction. Category, color, size and SKU are
 * fixed; variants are archived via `archivedAt`.
 */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const input = await readJsonBody(event, bodySchema);
  const db = useDb();

  const existing = requireFound(
    await db.query.products.findFirst({
      where: eq(schema.products.id, id),
      columns: { id: true, number: true },
      with: { category: { columns: { code: true } } },
    }),
    'Das Produkt',
  );

  const { newVariants, updatedVariants, ...fields } = input;

  // Missing fields mean "unchanged", not null.
  const productChanges: Record<string, unknown> = {};
  if (fields.name !== undefined) productChanges.name = fields.name;
  if (fields.description !== undefined) productChanges.description = fields.description;
  if (fields.basePriceGross !== undefined) productChanges.basePriceGross = centsToNumeric(fields.basePriceGross);
  if (fields.vatCategory !== undefined) productChanges.vatCategory = fields.vatCategory;
  if (fields.archivedAt !== undefined) productChanges.archivedAt = fields.archivedAt;

  try {
    return await db.transaction(async (tx) => {
      if (Object.keys(productChanges).length > 0) {
        await tx.update(schema.products).set(productChanges).where(eq(schema.products.id, id));
      }

      if (newVariants && newVariants.length > 0) {
        await tx
          .insert(schema.variants)
          .values(await buildVariantRows(tx, existing, existing.category.code, newVariants, 'newVariants'));
      }

      for (const variant of updatedVariants ?? []) {
        const current = await tx.query.variants.findFirst({
          where: eq(schema.variants.id, variant.id),
          columns: { productId: true },
        });
        if (current === undefined || current.productId !== id) {
          throw badRequest('Die Variante gehört nicht zu diesem Produkt.');
        }

        const changes: Record<string, unknown> = {};
        if (variant.priceGross !== undefined) changes.priceGross = centsToNumeric(variant.priceGross);
        if (variant.minimumStock !== undefined) changes.minimumStock = variant.minimumStock;
        if (variant.archivedAt !== undefined) changes.archivedAt = variant.archivedAt;
        if (Object.keys(changes).length > 0) {
          await tx.update(schema.variants).set(changes).where(eq(schema.variants.id, variant.id));
        }
      }

      return requireFound(await loadProduct(tx, id), 'Das Produkt');
    });
  } catch (error) {
    throw databaseError(error, 'Produkt ändern');
  }
});
