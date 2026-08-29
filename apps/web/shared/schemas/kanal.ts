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
  aktiv: flagSchema(true),
});

export const kanalAendernSchema = kanalAnlegenSchema.partial();

export type KanalAnlegen = z.infer<typeof kanalAnlegenSchema>;
export type KanalAendern = z.infer<typeof kanalAendernSchema>;
