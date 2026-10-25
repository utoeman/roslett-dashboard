import { eq } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { createProductSchema } from '../../../shared/schemas/product.js';
import { readJsonBody, requireFound } from '../../utils/validation.js';
import { badRequest, databaseError } from '../../utils/errors.js';
import { centsToNumeric } from '../../utils/money.js';
import { buildVariantRows, loadProduct } from '../../utils/products.js';

/**
 * Creates a product with at least one variant (a default one if none given)
 * and generated SKUs, in one transaction.
 */
export default defineEventHandler(async (event) => {
  const input = await readJsonBody(event, createProductSchema);
  const db = useDb();

  const category = await db.query.categories.findFirst({
    where: eq(schema.categories.id, input.categoryId),
  });
  if (category === undefined || category.archivedAt !== null) {
    throw badRequest('Die Kategorie gibt es nicht oder sie ist archiviert.', {
      categoryId: 'Kategorie nicht verfügbar.',
    });
  }

  const variants = input.variants && input.variants.length > 0 ? input.variants : [{ minimumStock: 0 }];

  try {
    const product = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(schema.products)
        .values({
          name: input.name,
          description: input.description ?? null,
          categoryId: category.id,
          basePriceGross: centsToNumeric(input.basePriceGross ?? null),
          vatCategory: input.vatCategory,
          careNotes: input.careNotes ?? null,
          safetyNotes: input.safetyNotes ?? null,
        })
        .returning({ id: schema.products.id, number: schema.products.number });
      const saved = requireFound(created, 'Das Produkt');

      await tx.insert(schema.variants).values(await buildVariantRows(tx, saved, category.code, variants, 'variants'));
      return requireFound(await loadProduct(tx, saved.id), 'Das Produkt');
    });
    setResponseStatus(event, 201);
    return product;
  } catch (error) {
    throw databaseError(error, 'Produkt anlegen');
  }
});
