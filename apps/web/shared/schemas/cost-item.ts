import { z } from 'zod';
import { flagSchema, moneySchema, percentSchema, requiredText, uuidSchema } from './common.js';

export const costItemKindSchema = z.enum(['fix', 'percent']);
export const distributionMethodSchema = z.enum(['value', 'quantity']);

/**
 * Cost items. `variantId` null means global. `value` is cents for "fix" and a
 * rate for "percent", so it is parsed depending on `kind`.
 */
const base = z.object({
  variantId: uuidSchema.nullable().optional(),
  label: requiredText('Bezeichnung'),
  inputTaxDeductible: flagSchema().default(false),
  active: flagSchema().default(true),
  /** Only relevant for shipment costs. */
  distributionMethod: distributionMethodSchema.default('value'),
});

/** Discriminated union: a rate can never slip through as cents. */
export const createCostItemSchema = z.discriminatedUnion('kind', [
  base.extend({
    kind: z.literal('fix'),
    value: moneySchema('Betrag'),
  }),
  base.extend({
    kind: z.literal('percent'),
    value: percentSchema('Satz'),
  }),
]);

/**
 * Update schema: a union cannot be made partial, so this is a separate
 * definition without defaults; PATCH only changes what is sent.
 */
export const updateCostItemSchema = z.union([
  z.object({
    kind: z.literal('fix'),
    value: moneySchema('Betrag').optional(),
    label: requiredText('Bezeichnung').optional(),
    variantId: uuidSchema.nullable().optional(),
    inputTaxDeductible: flagSchema().optional(),
    active: flagSchema().optional(),
    distributionMethod: distributionMethodSchema.optional(),
  }),
  z.object({
    kind: z.literal('percent'),
    value: percentSchema('Satz').optional(),
    label: requiredText('Bezeichnung').optional(),
    variantId: uuidSchema.nullable().optional(),
    inputTaxDeductible: flagSchema().optional(),
    active: flagSchema().optional(),
    distributionMethod: distributionMethodSchema.optional(),
  }),
]);

export type CreateCostItem = z.infer<typeof createCostItemSchema>;
export type UpdateCostItem = z.infer<typeof updateCostItemSchema>;
