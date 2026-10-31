import { eq, inArray } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { readId, requireFound } from '../../utils/validation.js';
import { conflict, databaseError } from '../../utils/errors.js';
import { variantUses } from '../../utils/variant-usage.js';

/**
 * Deletes an archived product with all its variants when none of them was
 * ever booked, received or sold (G25). Variant settings go with it. A product
 * already in Shopify stays there; the dashboard does not delete in Shopify.
 */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const db = useDb();
  const product = requireFound(
    await db.query.products.findFirst({
      where: eq(schema.products.id, id),
      columns: { archivedAt: true, name: true },
      with: { variants: { columns: { id: true } } },
    }),
    'Das Produkt',
  );
  if (product.archivedAt === null) throw conflict('Bitte das Produkt zuerst archivieren.');

  const variantIds = product.variants.map((v) => v.id);
  const uses = await variantUses(db, variantIds);
  if (uses.length > 0) {
    throw conflict(`${product.name}: Varianten werden in ${uses.join(', ')} verwendet; das Produkt bleibt archiviert.`);
  }

  try {
    await db.transaction(async (tx) => {
      if (variantIds.length > 0) {
        await tx.delete(schema.channelPrices).where(inArray(schema.channelPrices.variantId, variantIds));
        await tx.delete(schema.costItems).where(inArray(schema.costItems.variantId, variantIds));
        await tx.delete(schema.variants).where(inArray(schema.variants.id, variantIds));
      }
      await tx.delete(schema.products).where(eq(schema.products.id, id));
    });
  } catch (error) {
    throw databaseError(error, 'Produkt löschen');
  }
  setResponseStatus(event, 204);
  return null;
});
