import { z } from 'zod';
import { optionalerText, pflichttext } from './gemeinsam.js';

/**
 * Lieferanten.
 *
 * Geloescht wird nicht: ein Lieferant, mit dem nicht mehr gearbeitet wird,
 * wird archiviert. Seine Chargen bleiben bestehen, sonst verloere der
 * Wareneingang seine Herkunft.
 */
export const lieferantAnlegenSchema = z.object({
  name: pflichttext('Name'),
  /** ISO-3166-Laendercode, etwa "DE" oder "CN". Optional. */
  land: z
    .string()
    .trim()
    .length(2, { message: 'Land muss ein zweistelliger Laendercode sein, etwa DE.' })
    .toUpperCase()
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  notiz: optionalerText(),
});

export const lieferantAendernSchema = lieferantAnlegenSchema.partial().extend({
  archiviertAm: z.coerce.date().nullable().optional(),
});

export type LieferantAnlegen = z.infer<typeof lieferantAnlegenSchema>;
export type LieferantAendern = z.infer<typeof lieferantAendernSchema>;
