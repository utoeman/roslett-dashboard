import { z } from 'zod';
import { optionalText, requiredText } from './common.js';

/**
 * Lieferanten.
 *
 * Geloescht wird nicht: ein Lieferant, mit dem nicht mehr gearbeitet wird,
 * wird archiviert. Seine Chargen bleiben bestehen, sonst verloere der
 * Wareneingang seine Herkunft.
 */
export const createSupplierSchema = z.object({
  name: requiredText('Name'),
  /** ISO-3166-Laendercode, etwa "DE" oder "CN". Optional. */
  country: z
    .string()
    .trim()
    .length(2, { message: 'Land muss ein zweistelliger Laendercode sein, etwa DE.' })
    .toUpperCase()
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  note: optionalText(),
});

export const updateSupplierSchema = createSupplierSchema.partial().extend({
  archivedAt: z.coerce.date().nullable().optional(),
});

export type CreateSupplier = z.infer<typeof createSupplierSchema>;
export type UpdateSupplier = z.infer<typeof updateSupplierSchema>;
