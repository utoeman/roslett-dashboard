import { asc, inArray, isNull, or } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { readId, requireFound } from '../../utils/validation.js';
import { mapCostItem } from '../../utils/mapping.js';
import { loadProduct } from '../../utils/products.js';

/** Product with all variants (including archived) and its applicable cost items. */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const db = useDb();

  const product = requireFound(await loadProduct(db, id), 'Das Produkt');
  const variantIds = product.variants.map((variant) => variant.id);

  const costItems = await db.query.costItems.findMany({
    where:
      variantIds.length > 0
        ? or(isNull(schema.costItems.variantId), inArray(schema.costItems.variantId, variantIds))
        : isNull(schema.costItems.variantId),
    orderBy: [asc(schema.costItems.label)],
  });

  return { ...product, costItems: costItems.map(mapCostItem) };
});
