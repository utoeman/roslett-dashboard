import { z } from 'zod';
import { optionalText, requiredText } from './common.js';

/** Suppliers are archived, never deleted, so batches keep their origin. */
export const createSupplierSchema = z.object({
  name: requiredText('Name'),
  /** ISO 3166 country code, e.g. "DE". */
  country: z
    .string()
    .trim()
    .length(2, { message: 'Land muss ein zweistelliger Laendercode sein, etwa DE.' })
    .toUpperCase()
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  /** ISO 4217, preset in goods receipts. */
  defaultCurrency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, { message: 'Währung muss ein dreistelliger Code sein, etwa EUR.' })
    .optional(),
  note: optionalText(),
});

export const updateSupplierSchema = createSupplierSchema.partial().extend({
  archivedAt: z.coerce.date().nullable().optional(),
});

export type CreateSupplier = z.infer<typeof createSupplierSchema>;
export type UpdateSupplier = z.infer<typeof updateSupplierSchema>;
