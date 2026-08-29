import { z } from 'zod';
import { flagSchema, moneySchema, percentSchema, requiredText } from './common.js';

export const pricingRuleSchema = z.enum(['same_margin', 'fixed']);

/**
 * Verkaufskanaele.
 *
 * `same_margin` rechnet den Preis aus der Zielmarge zurueck, sodass nach
 * Abzug der Kanalgebuehren dieselbe Marge bleibt (Regel 5). `fixed` nimmt
 * einen gesetzten Preis und zeigt nur, was uebrig bleibt.
 */
export const createChannelSchema = z.object({
  name: requiredText('Name'),
  /** Prozentuale Gebuehr auf den Verkaufspreis. Eingabe "6,5" ergibt 0.065. */
  feePercent: percentSchema('Gebuehr').default(0),
  /** Fixe Gebuehr je Verkauf in Cent. */
  feeFixed: moneySchema('Fixgebuehr').default(0),
  pricingRule: pricingRuleSchema.default('same_margin'),
  active: flagSchema().default(true),
});

/**
 * Beim Aendern gibt es keine Standardwerte.
 *
 * `.partial()` macht Felder zwar optional, entfernt ihre `.default()` aber
 * nicht: ein nicht uebergebenes Feld faellt weiterhin auf den Standard
 * zurueck. Bei einem PATCH bedeutet das Datenverlust – wer nur den Namen
 * aendert, setzt damit die Gebuehren auf null. Deshalb ist dieses Schema
 * eigenstaendig definiert und traegt nirgends einen Standardwert.
 */
export const updateChannelSchema = z.object({
  name: requiredText('Name').optional(),
  feePercent: percentSchema('Gebuehr').optional(),
  feeFixed: moneySchema('Fixgebuehr').optional(),
  pricingRule: pricingRuleSchema.optional(),
  active: flagSchema().optional(),
});

export type CreateChannel = z.infer<typeof createChannelSchema>;
export type UpdateChannel = z.infer<typeof updateChannelSchema>;
