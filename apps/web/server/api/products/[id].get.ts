import { asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { readId, requireFound } from '../../utils/validation.js';
import { mapCostItem, mapVariant } from '../../utils/mapping.js';

/** Product with all variants (including archived) and its applicable cost items. */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const db = useDb();

  const product = requireFound(
    await db.query.products.findFirst({
      where: eq(schema.products.id, id),
      with: {
        variants: { orderBy: [asc(schema.variants.sku)] },
      },
    }),
    'Das Produkt',
  );

  const variantIds = product.variants.map((variant) => variant.id);

  const costItems = await db.query.costItems.findMany({
    where:
      variantIds.length > 0
        ? or(
            isNull(schema.costItems.variantId),
            inArray(schema.costItems.variantId, variantIds),
          )
        : isNull(schema.costItems.variantId),
    orderBy: [asc(schema.costItems.label)],
  });

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    archivedAt: product.archivedAt,
    createdAt: product.createdAt,
    variants: product.variants.map(mapVariant),
    costItems: costItems.map(mapCostItem),
  };
});
