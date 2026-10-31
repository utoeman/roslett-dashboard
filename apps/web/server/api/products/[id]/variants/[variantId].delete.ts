import { and, count, eq } from 'drizzle-orm';
import { schema, useDb } from '../../../../db/client.js';
import { readId, requireFound } from '../../../../utils/validation.js';
import { conflict, databaseError } from '../../../../utils/errors.js';
import { variantUses } from '../../../../utils/variant-usage.js';

/**
 * Deletes an archived variant that was never booked, received or sold. The
 * journal and sales must stay traceable, so a used variant stays archived.
 * Settings that only belong to the variant (channel prices, own cost items)
 * go with it.
 */
export default defineEventHandler(async (event) => {
  const productId = readId(event);
  const variantId = readId(event, 'variantId');
  const db = useDb();
  const variant = requireFound(
    await db.query.variants.findFirst({
      where: and(eq(schema.variants.id, variantId), eq(schema.variants.productId, productId)),
      columns: { archivedAt: true, sku: true },
    }),
    'Die Variante',
  );
  if (variant.archivedAt === null) throw conflict('Bitte die Variante zuerst archivieren.');

  // A product always keeps at least one variant (domain model); the whole product can be deleted instead.
  const [siblings] = await db.select({ n: count() }).from(schema.variants).where(eq(schema.variants.productId, productId));
  if ((siblings?.n ?? 0) <= 1) {
    throw conflict('Das ist die letzte Variante. Archivieren Sie das Produkt und löschen Sie es oben als Ganzes.');
  }

  const uses = await variantUses(db, [variantId]);
  if (uses.length > 0) {
    throw conflict(`${variant.sku} wird in ${uses.join(', ')} verwendet und bleibt archiviert.`);
  }

  try {
    await db.transaction(async (tx) => {
      await tx.delete(schema.channelPrices).where(eq(schema.channelPrices.variantId, variantId));
      await tx.delete(schema.costItems).where(eq(schema.costItems.variantId, variantId));
      await tx.delete(schema.variants).where(eq(schema.variants.id, variantId));
    });
  } catch (error) {
    throw databaseError(error, 'Variante löschen');
  }
  setResponseStatus(event, 204);
  return null;
});
