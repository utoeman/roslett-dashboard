/**
 * Products and variants. A product always has at least one variant (a default
 * one if needed), so the rest of the code has no special cases.
 */

import { z } from 'zod';
import {
  moneySchema,
  optionalText,
  percentSchema,
  requiredText,
  uuidSchema,
} from './common.js';

/** Strict SKU charset: it ends up in exports and possibly file names. */
export const skuSchema = z
  .string()
  .trim()
  .min(1, { message: 'SKU darf nicht leer sein.' })
  .max(64, { message: 'SKU ist zu lang (hoechstens 64 Zeichen).' })
  .regex(/^[A-Za-z0-9._-]+$/, {
    message:
      'SKU darf nur Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich enthalten.',
  });

export const createVariantSchema = z.object({
  sku: skuSchema,
  label: requiredText('Bezeichnung'),
  minimumStock: z.coerce
    .number()
    .int({ message: 'Mindestbestand muss eine ganze Zahl sein.' })
    .min(0, { message: 'Mindestbestand darf nicht negativ sein.' })
    .default(0),
  /** Net list price in cents; often only known after costing. */
  basePriceNet: moneySchema('Basispreis').nullable().optional(),
  /** Informational; calculation is net. */
  vatRate: percentSchema('Umsatzsteuersatz').default(0.19),
});

export const updateVariantSchema = createVariantSchema.partial().extend({
  id: uuidSchema,
  /** A timestamp archives, null restores. */
  archivedAt: z.coerce.date().nullable().optional(),
});

export const createProductSchema = z.object({
  name: requiredText('Name'),
  description: optionalText(),
  category: optionalText(100),
  /** Without variants the API creates a default one. */
  variants: z.array(createVariantSchema).optional(),
  /** Only used when no variants are given. */
  sku: skuSchema.optional(),
});

export const updateProductSchema = z.object({
  name: requiredText('Name').optional(),
  description: optionalText(),
  category: optionalText(100),
  archivedAt: z.coerce.date().nullable().optional(),
});

export type CreateVariant = z.infer<typeof createVariantSchema>;
export type UpdateVariant = z.infer<typeof updateVariantSchema>;
export type CreateProduct = z.infer<typeof createProductSchema>;
export type UpdateProduct = z.infer<typeof updateProductSchema>;
