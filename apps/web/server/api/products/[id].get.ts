import { asc, inArray, isNull, or } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { readId, requireFound } from '../../utils/validation.js';
import { mapCostItem } from '../../utils/mapping.js';
import { loadProduct } from '../../utils/products.js';
import { currentVatRates, withInventory } from '../../utils/inventory.js';

/** Product with all variants (including archived, with stock) and its applicable cost items. */
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

  const [[withStock], vatRates] = await Promise.all([withInventory(db, [product]), currentVatRates(db)]);
  // Rates for both categories: the margin preview follows a category change in the form.
  return { ...withStock, costItems: costItems.map(mapCostItem), vatRates };
});
