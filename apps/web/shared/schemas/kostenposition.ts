import { z } from 'zod';
import { geldSchema, pflichttext, prozentSchema, uuidSchema } from './gemeinsam.js';

export const kostenpositionArtSchema = z.enum(['fix', 'prozent']);
export const verteilmethodeSchema = z.enum(['wert', 'stueckzahl']);

/**
 * Kostenpositionen.
 *
 * `varianteId` null bedeutet: gilt fuer alle Varianten. Das Feld
 * `vorsteuerabzugsfaehig` entscheidet, ob die Position in die Selbstkosten
 * eingeht (Regel 3): Einfuhrumsatzsteuer bleibt draussen, Zoll geht hinein.
 *
 * Der Wert bedeutet je nach Art etwas anderes – bei "fix" ein Betrag in Cent,
 * bei "prozent" ein Satz. Deshalb wird er nicht pauschal geparst, sondern
 * abhaengig von der Art, siehe unten.
 */
const basis = z.object({
  varianteId: uuidSchema.nullable().optional(),
  bezeichnung: pflichttext('Bezeichnung'),
  vorsteuerabzugsfaehig: z.coerce.boolean().default(false),
  aktiv: z.coerce.boolean().default(true),
  /** Nur fuer Nebenkosten einer Sendung relevant (Regel 7). */
  verteilmethode: verteilmethodeSchema.default('wert'),
});

/**
 * Die Art bestimmt, wie der Wert gelesen wird. Ein diskriminierter Verbund
 * erzwingt das auf Typebene: ein Prozentsatz kann nicht versehentlich als
 * Cent-Betrag durchrutschen.
 */
export const kostenpositionAnlegenSchema = z.discriminatedUnion('art', [
  basis.extend({
    art: z.literal('fix'),
    wert: geldSchema('Betrag'),
  }),
  basis.extend({
    art: z.literal('prozent'),
    wert: prozentSchema('Satz'),
  }),
]);

/**
 * Beim Aendern wird die Art mitgeschickt, damit der Wert richtig gelesen wird.
 * Ein Verbund laesst sich nicht teilweise machen, deshalb eine eigene Fassung
 * mit optionalen Feldern.
 */
export const kostenpositionAendernSchema = z.union([
  z.object({
    art: z.literal('fix'),
    wert: geldSchema('Betrag').optional(),
    bezeichnung: pflichttext('Bezeichnung').optional(),
    varianteId: uuidSchema.nullable().optional(),
    vorsteuerabzugsfaehig: z.coerce.boolean().optional(),
    aktiv: z.coerce.boolean().optional(),
    verteilmethode: verteilmethodeSchema.optional(),
  }),
  z.object({
    art: z.literal('prozent'),
    wert: prozentSchema('Satz').optional(),
    bezeichnung: pflichttext('Bezeichnung').optional(),
    varianteId: uuidSchema.nullable().optional(),
    vorsteuerabzugsfaehig: z.coerce.boolean().optional(),
    aktiv: z.coerce.boolean().optional(),
    verteilmethode: verteilmethodeSchema.optional(),
  }),
]);

export type KostenpositionAnlegen = z.infer<typeof kostenpositionAnlegenSchema>;
export type KostenpositionAendern = z.infer<typeof kostenpositionAendernSchema>;
