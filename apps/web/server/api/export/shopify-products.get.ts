import { asc, isNull } from 'drizzle-orm';
import { buildShopifyCsv, toCsv } from '@roslett/core';
import { schema, useDb } from '../../db/client.js';
import { mapProduct } from '../../utils/mapping.js';
import { stockFigures } from '../../utils/inventory.js';

/**
 * Active products and variants as a Shopify product CSV. Returned as JSON with
 * the warnings, so the page can show them before the download.
 */
export default defineEventHandler(async () => {
  const db = useDb();
  const rows = await db.query.products.findMany({
    where: isNull(schema.products.archivedAt),
    orderBy: [asc(schema.products.number)],
    with: {
      category: true,
      variants: {
        where: isNull(schema.variants.archivedAt),
        orderBy: [asc(schema.variants.sku)],
        with: { color: true },
      },
    },
  });
  const products = rows.map(mapProduct).filter((p) => p.variants.length > 0);
  const figures = await stockFigures(
    db,
    products.flatMap((p) => p.variants.map((v) => v.id)),
  );

  const [settings] = await db.select().from(schema.companySettings).limit(1);
  const { rows: csvRows, warnings } = buildShopifyCsv(
    products.map((p) => ({
      number: p.number,
      name: p.name,
      description: p.description,
      categoryName: p.category.name,
      textile: p.category.group === 'textile',
      careNotes: p.careNotes,
      safetyNotes: p.safetyNotes,
      variants: p.variants.map((v) => ({
        sku: v.sku,
        colorName: v.color?.name ?? null,
        size: v.size,
        priceGross: v.priceGross ?? p.basePriceGross,
        costEur: figures.get(v.id)?.averageCostEur ?? null,
        fiber: v.fiber,
        fiberFilling: v.fiberFilling,
      })),
    })),
    settings
      ? { name: settings.manufacturerName, address: settings.manufacturerAddress, email: settings.manufacturerEmail }
      : null,
  );

  return {
    csv: toCsv(csvRows),
    warnings,
    products: products.length,
    variants: products.reduce((total, p) => total + p.variants.length, 0),
  };
});
