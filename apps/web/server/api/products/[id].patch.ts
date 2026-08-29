import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema, useDb } from '../../db/client.js';
import {
  createVariantSchema,
  updateProductSchema,
  updateVariantSchema,
} from '../../../shared/schemas/product.js';
import { readBody, readId, requireFound } from '../../utils/validation.js';
import { badRequest, databaseError } from '../../utils/errors.js';
import { centsToNumeric, rateToNumeric } from '../../utils/money.js';
import { mapVariant } from '../../utils/mapping.js';

/**
 * Der Rumpf kann Produktfelder aendern und gleichzeitig Varianten anlegen
 * oder aendern. Beides in einem Aufruf, damit das Detailformular mit einem
 * Speichern auskommt und nicht in einen halb gespeicherten Zustand geraet.
 */
const bodySchema = updateProductSchema.extend({
  newVariants: z.array(createVariantSchema).optional(),
  updatedVariants: z.array(updateVariantSchema).optional(),
});

/**
 * Artikel aendern.
 *
 * Geloescht wird nichts. Eine Variante verschwindet, indem `archivedAt`
 * gesetzt wird; `null` holt sie zurueck.
 *
 * Alles laeuft in einer Transaktion: schlaegt eine einzelne Variante fehl,
 * etwa wegen doppelter SKU, bleibt der gesamte Vorgang aus. Sonst waere nach
 * einem Fehlschlag unklar, was gespeichert wurde und was nicht.
 */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const input = await readBody(event, bodySchema);
  const db = useDb();

  requireFound(
    await db.query.products.findFirst({
      where: eq(schema.products.id, id),
      columns: { id: true },
    }),
    'Der Artikel',
  );

  const { newVariants, updatedVariants, ...productFields } = input;

  // Nur uebergebene Felder anfassen: ein fehlendes Feld bedeutet
  // "unveraendert", nicht "auf null setzen".
  const productChanges: Record<string, unknown> = {};
  if (productFields.name !== undefined) productChanges.name = productFields.name;
  if (productFields.description !== undefined)
    productChanges.description = productFields.description;
  if (productFields.category !== undefined)
    productChanges.category = productFields.category;
  if (productFields.archivedAt !== undefined)
    productChanges.archivedAt = productFields.archivedAt;

  try {
    return await db.transaction(async (tx) => {
      if (Object.keys(productChanges).length > 0) {
        await tx
          .update(schema.products)
          .set(productChanges)
          .where(eq(schema.products.id, id));
      }

      if (newVariants && newVariants.length > 0) {
        await tx.insert(schema.variants).values(
          newVariants.map((variant) => ({
            productId: id,
            sku: variant.sku,
            label: variant.label,
            minimumStock: variant.minimumStock ?? 0,
            basePriceNet: centsToNumeric(variant.basePriceNet ?? null),
            vatRate: rateToNumeric(variant.vatRate ?? 0.19) ?? '0.1900',
          })),
        );
      }

      for (const variant of updatedVariants ?? []) {
        const existing = await tx.query.variants.findFirst({
          where: eq(schema.variants.id, variant.id),
          columns: { id: true, productId: true },
        });
        if (existing === undefined) {
          throw badRequest(`Variante ${variant.id} wurde nicht gefunden.`);
        }
        // Verhindert, dass ueber diesen Weg eine fremde Variante veraendert wird.
        if (existing.productId !== id) {
          throw badRequest('Die Variante gehoert nicht zu diesem Artikel.');
        }

        const changes: Record<string, unknown> = {};
        if (variant.sku !== undefined) changes.sku = variant.sku;
        if (variant.label !== undefined) changes.label = variant.label;
        if (variant.minimumStock !== undefined)
          changes.minimumStock = variant.minimumStock;
        if (variant.basePriceNet !== undefined)
          changes.basePriceNet = centsToNumeric(variant.basePriceNet);
        if (variant.vatRate !== undefined)
          changes.vatRate = rateToNumeric(variant.vatRate);
        if (variant.archivedAt !== undefined)
          changes.archivedAt = variant.archivedAt;

        if (Object.keys(changes).length > 0) {
          await tx
            .update(schema.variants)
            .set(changes)
            .where(eq(schema.variants.id, variant.id));
        }
      }

      const updated = await tx.query.products.findFirst({
        where: eq(schema.products.id, id),
        with: { variants: true },
      });
      if (updated === undefined) {
        throw new Error('Artikel nach dem Speichern nicht auffindbar.');
      }
      // Ueber dieselbe Abbildung wie die GET-Routen, damit die Oberflaeche
      // nicht je Endpunkt unterschiedlich rechnen muss.
      return {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        category: updated.category,
        archivedAt: updated.archivedAt,
        createdAt: updated.createdAt,
        variants: updated.variants.map(mapVariant),
      };
    });
  } catch (error) {
    throw databaseError(error, 'Artikel aendern');
  }
});
