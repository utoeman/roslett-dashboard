import { and, count, eq } from 'drizzle-orm';
import { schema, useDb } from '../../../../db/client.js';
import { readId, requireFound } from '../../../../utils/validation.js';
import { conflict, databaseError } from '../../../../utils/errors.js';

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

  // A product always keeps at least one variant (domain model).
  const [siblings] = await db.select({ n: count() }).from(schema.variants).where(eq(schema.variants.productId, productId));
  if ((siblings?.n ?? 0) <= 1) {
    throw conflict('Das ist die letzte Variante des Produkts. Bitte stattdessen das Produkt archivieren.');
  }

  const usage = async (table: typeof schema.stockEntries | typeof schema.batches | typeof schema.saleItems) => {
    const [row] = await db.select({ n: count() }).from(table).where(eq(table.variantId, variantId));
    return row?.n ?? 0;
  };
  const [entries, batches, sales] = await Promise.all([
    usage(schema.stockEntries),
    usage(schema.batches),
    usage(schema.saleItems),
  ]);
  const uses = [
    entries > 0 ? `${entries} Buchung(en)` : null,
    batches > 0 ? `${batches} Wareneingangsposition(en)` : null,
    sales > 0 ? `${sales} Verkaufsposition(en)` : null,
  ].filter((u): u is string => u !== null);
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
