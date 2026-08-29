import { z } from 'zod';
import { flagSchema, geldSchema, pflichttext, prozentSchema } from './gemeinsam.js';

export const preisregelSchema = z.enum(['gleiche_marge', 'fest']);

/**
 * Verkaufskanaele.
 *
 * `gleiche_marge` rechnet den Preis aus der Zielmarge zurueck, sodass nach
 * Abzug der Kanalgebuehren dieselbe Marge bleibt (Regel 5). `fest` nimmt
 * einen gesetzten Preis und zeigt nur, was uebrig bleibt.
 */
export const kanalAnlegenSchema = z.object({
  name: pflichttext('Name'),
  /** Prozentuale Gebuehr auf den Verkaufspreis. Eingabe "6,5" ergibt 0.065. */
  gebuehrProzent: prozentSchema('Gebuehr').default(0),
  /** Fixe Gebuehr je Verkauf in Cent. */
  gebuehrFix: geldSchema('Fixgebuehr').default(0),
  preisregel: preisregelSchema.default('gleiche_marge'),
  aktiv: flagSchema().default(true),
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
export const kanalAendernSchema = z.object({
  name: pflichttext('Name').optional(),
  gebuehrProzent: prozentSchema('Gebuehr').optional(),
  gebuehrFix: geldSchema('Fixgebuehr').optional(),
  preisregel: preisregelSchema.optional(),
  aktiv: flagSchema().optional(),
});

export type KanalAnlegen = z.infer<typeof kanalAnlegenSchema>;
export type KanalAendern = z.infer<typeof kanalAendernSchema>;
