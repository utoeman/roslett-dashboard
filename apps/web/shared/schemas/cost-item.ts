import { z } from 'zod';
import { flagSchema, moneySchema, percentSchema, requiredText, uuidSchema } from './common.js';

export const costItemKindSchema = z.enum(['fix', 'percent']);
export const distributionMethodSchema = z.enum(['value', 'quantity']);

/**
 * Kostenpositionen.
 *
 * `variantId` null bedeutet: gilt fuer alle Varianten. Das Feld
 * `inputTaxDeductible` entscheidet, ob die Position in die Selbstkosten
 * eingeht (Regel 3): Einfuhrumsatzsteuer bleibt draussen, Zoll geht hinein.
 *
 * Der Wert bedeutet je nach Art etwas anderes – bei "fix" ein Betrag in Cent,
 * bei "percent" eine Rate. Deshalb wird er nicht pauschal geparst, sondern
 * abhaengig von der Art, siehe unten.
 */
const base = z.object({
  variantId: uuidSchema.nullable().optional(),
  label: requiredText('Bezeichnung'),
  inputTaxDeductible: flagSchema().default(false),
  active: flagSchema().default(true),
  /** Nur fuer Nebenkosten einer Sendung relevant (Regel 7). */
  distributionMethod: distributionMethodSchema.default('value'),
});

/**
 * Die Art bestimmt, wie der Wert gelesen wird. Ein diskriminierter Verbund
 * erzwingt das auf Typebene: eine Rate kann nicht versehentlich als
 * Cent-Betrag durchrutschen.
 */
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
 * Beim Aendern wird die Art mitgeschickt, damit der Wert richtig gelesen
 * wird. Ein Verbund laesst sich nicht teilweise machen, deshalb eine eigene
 * Fassung mit optionalen Feldern – und ohne Standardwerte, damit ein PATCH
 * nur uebertraegt, was uebergeben wurde.
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
