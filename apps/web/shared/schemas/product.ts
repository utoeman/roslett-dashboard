/**
 * Schemas fuer Produkte und Varianten.
 *
 * Ein Produkt hat immer mindestens eine Variante. Auch ein Artikel ohne
 * echte Ausfuehrungen bekommt genau eine Standardvariante, damit Chargen,
 * Buchungen und Preise ausnahmslos an einer Variante haengen und der uebrige
 * Code keine Sonderfaelle kennt.
 */

import { z } from 'zod';
import {
  moneySchema,
  optionalText,
  percentSchema,
  requiredText,
  uuidSchema,
} from './common.js';

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
  .min(1, { message: 'SKU darf nicht leer sein.' })
  .max(64, { message: 'SKU ist zu lang (hoechstens 64 Zeichen).' })
  .regex(/^[A-Za-z0-9._-]+$/, {
    message:
      'SKU darf nur Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich enthalten.',
  });

export const createVariantSchema = z.object({
  sku: skuSchema,
  label: requiredText('Bezeichnung'),
  minimumStock: z.coerce
    .number()
    .int({ message: 'Mindestbestand muss eine ganze Zahl sein.' })
    .min(0, { message: 'Mindestbestand darf nicht negativ sein.' })
    .default(0),
  /** Listenpreis netto in Cent. Optional, weil er sich oft erst aus der Kalkulation ergibt. */
  basePriceNet: moneySchema('Basispreis').nullable().optional(),
  /** Umsatzsteuersatz zur Information. Beruehrt die Kalkulation nicht (Regel 2). */
  vatRate: percentSchema('Umsatzsteuersatz').default(0.19),
});

export const updateVariantSchema = createVariantSchema.partial().extend({
  id: uuidSchema,
  /** Zeitstempel setzen archiviert, null holt die Variante zurueck. */
  archivedAt: z.coerce.date().nullable().optional(),
});

export const createProductSchema = z.object({
  name: requiredText('Name'),
  description: optionalText(),
  category: optionalText(100),
  /**
   * Wird keine Variante uebergeben, legt die API selbst eine Standardvariante
   * an. Der haeufige Fall – ein Artikel ohne Ausfuehrungen – kostet den
   * Nutzer damit keinen zusaetzlichen Schritt.
   */
  variants: z.array(createVariantSchema).optional(),
  /** Nur relevant, wenn keine Varianten uebergeben werden. */
  sku: skuSchema.optional(),
});

export const updateProductSchema = z.object({
  name: requiredText('Name').optional(),
  description: optionalText(),
  category: optionalText(100),
  archivedAt: z.coerce.date().nullable().optional(),
});

export type CreateVariant = z.infer<typeof createVariantSchema>;
export type UpdateVariant = z.infer<typeof updateVariantSchema>;
export type CreateProduct = z.infer<typeof createProductSchema>;
export type UpdateProduct = z.infer<typeof updateProductSchema>;
