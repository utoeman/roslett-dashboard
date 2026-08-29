/**
 * Schemas fuer Produkte und Varianten.
 *
 * Ein Produkt hat immer mindestens eine Variante. Auch ein Artikel ohne echte
 * Ausfuehrungen bekommt genau eine Standardvariante, damit Chargen, Buchungen
 * und Preise ausnahmslos an einer Variante haengen und der uebrige Code keine
 * Sonderfaelle kennt.
 */

import { z } from 'zod';
import {
  geldSchema,
  optionalerText,
  pflichttext,
  prozentSchema,
  uuidSchema,
} from './gemeinsam.js';

/**
 * Artikelnummer.
 *
 * Bewusst streng: Buchstaben, Ziffern, Bindestrich, Unterstrich und Punkt.
 * Die SKU landet spaeter in Exporten und moeglicherweise in Dateinamen;
 * Leerzeichen und Sonderzeichen machen dort Aerger.
 */
export const skuSchema = z
  .string()
  .trim()
  .min(1, { message: 'Artikelnummer darf nicht leer sein.' })
  .max(64, { message: 'Artikelnummer ist zu lang (hoechstens 64 Zeichen).' })
  .regex(/^[A-Za-z0-9._-]+$/, {
    message:
      'Artikelnummer darf nur Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich enthalten.',
  });

export const varianteAnlegenSchema = z.object({
  sku: skuSchema,
  bezeichnung: pflichttext('Bezeichnung'),
  mindestbestand: z.coerce
    .number()
    .int({ message: 'Mindestbestand muss eine ganze Zahl sein.' })
    .min(0, { message: 'Mindestbestand darf nicht negativ sein.' })
    .default(0),
  /** Listenpreis netto in Cent. Optional, weil er sich oft erst aus der Kalkulation ergibt. */
  basispreisNetto: geldSchema('Basispreis').nullable().optional(),
  /** Umsatzsteuersatz zur Information. Beruehrt die Kalkulation nicht (Regel 2). */
  ustSatz: prozentSchema('Umsatzsteuersatz').default(0.19),
});

export const varianteAendernSchema = varianteAnlegenSchema.partial().extend({
  id: uuidSchema,
  /** Zeitstempel setzen archiviert, null holt die Variante zurueck. */
  archiviertAm: z.coerce.date().nullable().optional(),
});

export const produktAnlegenSchema = z.object({
  name: pflichttext('Name'),
  beschreibung: optionalerText(),
  kategorie: optionalerText(100),
  /**
   * Wird keine Variante uebergeben, legt die API selbst eine Standardvariante
   * an. Der haeufige Fall – ein Artikel ohne Ausfuehrungen – kostet den
   * Nutzer damit keinen zusaetzlichen Schritt.
   */
  varianten: z.array(varianteAnlegenSchema).optional(),
  /** Nur relevant, wenn keine Varianten uebergeben werden. */
  sku: skuSchema.optional(),
});

export const produktAendernSchema = z.object({
  name: pflichttext('Name').optional(),
  beschreibung: optionalerText(),
  kategorie: optionalerText(100),
  archiviertAm: z.coerce.date().nullable().optional(),
});

export type VarianteAnlegen = z.infer<typeof varianteAnlegenSchema>;
export type VarianteAendern = z.infer<typeof varianteAendernSchema>;
export type ProduktAnlegen = z.infer<typeof produktAnlegenSchema>;
export type ProduktAendern = z.infer<typeof produktAendernSchema>;
