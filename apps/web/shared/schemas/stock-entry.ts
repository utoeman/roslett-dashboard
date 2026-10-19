/** Manual journal entries, reversals and journal filters. */

import { z } from 'zod';
import { flagSchema, listQuerySchema, optionalText, requiredText, uuidSchema } from './common.js';
import { isoDateSchema } from './goods-receipt.js';

const quantitySchema = z.coerce
  .number()
  .int({ message: 'Menge muss eine ganze Zahl sein.' })
  .min(1, { message: 'Menge muss mindestens 1 sein.' });

const base = { variantId: uuidSchema, postedAt: isoDateSchema.optional() };

/** A note is required where the reason is not obvious from the entry itself. */
export const manualEntrySchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('shrinkage'), quantity: quantitySchema, note: requiredText('Notiz', 500) }),
  z.object({ ...base, kind: z.literal('own_use'), quantity: quantitySchema, note: requiredText('Notiz', 500) }),
  z.object({
    ...base,
    kind: z.literal('stocktake'),
    counted: z.coerce.number().int().min(0, { message: 'Gezählte Menge darf nicht negativ sein.' }),
    note: requiredText('Notiz', 500),
  }),
  z.object({
    ...base,
    kind: z.literal('supplier_return'),
    batchId: uuidSchema,
    quantity: quantitySchema,
    note: optionalText(500),
  }),
]);

export const reverseSchema = z.object({ note: optionalText(500) });

export const journalQuerySchema = listQuerySchema.pick({ limit: true, offset: true }).extend({
  variantId: uuidSchema.optional(),
  kind: z
    .enum(['goods_receipt', 'sale', 'return', 'shrinkage', 'own_use', 'stocktake', 'supplier_return', 'reversal'])
    .optional(),
  shortfallsOnly: flagSchema().default(false),
});

export type ManualEntry = z.infer<typeof manualEntrySchema>;
