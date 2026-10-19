import { schema, useDb } from '../../db/client.js';
import { createProductSchema } from '../../../shared/schemas/product.js';
import { readJsonBody } from '../../utils/validation.js';
import { badRequest, databaseError } from '../../utils/errors.js';
import { centsToNumeric, rateToNumeric } from '../../utils/money.js';
import { mapVariant } from '../../utils/mapping.js';

/**
 * Artikel anlegen.
 *
 * Ein Produkt bekommt immer mindestens eine Variante. Werden keine
 * uebergeben, legt die Route selbst eine Standardvariante an – der haeufige
 * Fall eines Artikels ohne Ausfuehrungen kostet den Nutzer damit keinen
 * zusaetzlichen Schritt, und nachgelagerter Code muss nie ein Produkt ohne
 * Variante behandeln.
 *
 * Produkt und Varianten entstehen in einer Transaktion. Ohne sie koennte bei
 * einer doppelten SKU ein Produkt ohne Variante zurueckbleiben – genau der
 * Zustand, den die Regel ausschliesst.
 */
export default defineEventHandler(async (event) => {
  const input = await readJsonBody(event, createProductSchema);
  const db = useDb();

  const variants =
    input.variants && input.variants.length > 0
      ? input.variants
      : [
          {
            sku:
              input.sku ??
              (() => {
                throw badRequest(
                  'Es muss entweder eine SKU oder mindestens eine Variante angegeben werden.',
                  { sku: 'SKU fehlt.' },
                );
              })(),
            label: 'Standard',
            minimumStock: 0,
            basePriceNet: null,
            vatRate: 0.19,
          },
        ];

  try {
    return await db.transaction(async (tx) => {
      const [product] = await tx
        .insert(schema.products)
        .values({
          name: input.name,
          description: input.description ?? null,
          category: input.category ?? null,
        })
        .returning();

      if (product === undefined) {
        throw new Error('Produkt konnte nicht angelegt werden.');
      }

      const createdVariants = await tx
        .insert(schema.variants)
        .values(
          variants.map((variant) => ({
            productId: product.id,
            sku: variant.sku,
            label: variant.label,
            minimumStock: variant.minimumStock ?? 0,
            basePriceNet: centsToNumeric(variant.basePriceNet ?? null),
            vatRate: rateToNumeric(variant.vatRate ?? 0.19) ?? '0.1900',
          })),
        )
        .returning();

      setResponseStatus(event, 201);
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        category: product.category,
        createdAt: product.createdAt,
        variants: createdVariants.map(mapVariant),
      };
    });
  } catch (error) {
    throw databaseError(error, 'Produkt anlegen');
  }
});
