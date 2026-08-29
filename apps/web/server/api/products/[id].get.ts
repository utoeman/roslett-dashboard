import { asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { readId, requireFound } from '../../utils/validation.js';
import { mapCostItem, mapVariant } from '../../utils/mapping.js';

/**
 * Artikel im Detail.
 *
 * Liefert das Produkt mit allen Varianten – archivierte eingeschlossen,
 * damit die Detailansicht die vollstaendige Historie zeigt – sowie die
 * Kostenpositionen, die fuer diesen Artikel gelten: die globalen und die
 * variantenspezifischen.
 */
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
    'Der Artikel',
  );

  const variantIds = product.variants.map((variant) => variant.id);

  // Globale Positionen gelten immer, variantenspezifische nur fuer die
  // Varianten dieses Produkts.
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
