/**
 * Bausteine, die alle Schemas teilen.
 *
 * Die Schemas liegen in shared/, damit Client und Server dieselbe Definition
 * verwenden. Eine Regel, die im Formular gilt, gilt damit zwangslaeufig auch
 * in der API – sie koennen nicht auseinanderlaufen.
 *
 * Die Fehlermeldungen sind deutsch: sie werden unveraendert im Formular
 * angezeigt.
 */

import { z } from 'zod';

export const uuidSchema = z.uuid({ message: 'Keine gueltige Kennung.' });

/** Pflichttext mit sinnvoller Obergrenze und ohne fuehrende Leerzeichen. */
export const requiredText = (field: string, max = 200) =>
  z
    .string()
    .trim()
    .min(1, { message: `${field} darf nicht leer sein.` })
    .max(max, { message: `${field} ist zu lang (hoechstens ${max} Zeichen).` });

/** Freitext, der auch leer bleiben darf. Leerstring wird zu null. */
export const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max, { message: `Text ist zu lang (hoechstens ${max} Zeichen).` })
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

/**
 * Geldbetrag als Nutzereingabe.
 *
 * Angenommen wird sowohl eine Zahl in Euro als auch ein String in deutscher
 * oder englischer Schreibweise. Das Ergebnis ist immer ein ganzzahliger
 * Cent-Betrag (Regel 1) – die Umrechnung passiert hier, an der Systemgrenze,
 * und nirgends sonst.
 */
export const moneySchema = (field = 'Betrag') =>
  z.union([z.number(), z.string()]).transform((value, ctx) => {
    try {
      const cents =
        typeof value === 'number'
          ? Math.round(value * 100)
          : parseMoneyInput(value);
      if (!Number.isFinite(cents)) throw new Error('nicht endlich');
      return cents;
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: `${field} ist kein gueltiger Betrag.`,
      });
      return z.NEVER;
    }
  });

/**
 * Kleiner Parser fuer die Systemgrenze.
 *
 * Bewusst eine eigene, schlanke Fassung statt eines Imports aus
 * packages/core: shared/ laeuft auch im Browser, und die Engine soll nicht
 * ins Client-Bundle wandern, nur damit ein Formularfeld gelesen werden kann.
 * Die Regeln sind dieselben – das letzte Trennzeichen entscheidet.
 */
function parseMoneyInput(input: string): number {
  const raw = input.trim().replace(/[€$£\s]/g, '').replace(/(EUR|USD|GBP)/gi, '');
  if (raw === '') throw new Error('leer');

  let text = raw;
  let negative = false;
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }
  if (!/^[\d.,]+$/.test(text)) throw new Error('ungueltig');

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  const separatorAt = Math.max(lastDot, lastComma);

  let whole: string;
  let fraction: string;
  if (separatorAt === -1) {
    whole = text;
    fraction = '';
  } else {
    const afterSeparator = text.slice(separatorAt + 1);
    const separator = text.charAt(separatorAt);
    const singleSeparator =
      text.indexOf(separator) === separatorAt &&
      (separator === '.' ? lastComma : lastDot) === -1;
    if (afterSeparator.length === 3 && singleSeparator) {
      whole = text.replace(/[.,]/g, '');
      fraction = '';
    } else {
      whole = text.slice(0, separatorAt).replace(/[.,]/g, '');
      fraction = afterSeparator;
    }
  }

  if (!/^\d*$/.test(fraction)) throw new Error('ungueltig');
  const wholeNumber = whole === '' ? 0 : Number.parseInt(whole, 10);
  const fractionCents = Number.parseInt((fraction + '00').slice(0, 2), 10);
  const rest =
    fraction.length > 2 ? Number.parseFloat('0.' + fraction.slice(2)) : 0;
  const cents = Math.round(wholeNumber * 100 + fractionCents + rest);
  return negative ? -cents : cents;
}

/**
 * Prozentsatz als Nutzereingabe.
 *
 * Der Nutzer tippt "6,5" und meint 6,5 Prozent. Gespeichert wird 0.065.
 * Die Umrechnung gehoert an die Systemgrenze, damit im Rest des Systems
 * ausschliesslich Raten kursieren.
 */
export const percentSchema = (field = 'Prozentsatz', maxPercent = 100) =>
  z.union([z.number(), z.string()]).transform((value, ctx) => {
    const parsed =
      typeof value === 'number'
        ? value
        : Number.parseFloat(value.trim().replace(',', '.').replace('%', ''));
    if (!Number.isFinite(parsed)) {
      ctx.addIssue({ code: 'custom', message: `${field} ist keine gueltige Zahl.` });
      return z.NEVER;
    }
    if (parsed < 0 || parsed > maxPercent) {
      ctx.addIssue({
        code: 'custom',
        message: `${field} muss zwischen 0 und ${maxPercent} liegen.`,
      });
      return z.NEVER;
    }
    return parsed / 100;
  });

/**
 * Wahrheitswert aus einer Abfragezeichenkette.
 *
 * `z.coerce.boolean()` ist hier unbrauchbar: es wendet die Truthiness von
 * JavaScript an, und damit wird auch "false" zu `true` – jede nicht leere
 * Zeichenkette tut das. In der Abfragezeichenkette steht aber genau dieses
 * "false", sodass ein Filter niemals greifen wuerde.
 *
 * Der Standardwert wird bewusst NICHT hier eingebaut, sondern an der
 * Aufrufstelle gesetzt: ein `.default()` innerhalb dieser Funktion greift
 * vor einem aeusseren `.optional()` oder `.partial()` und macht damit aus
 * einem fehlenden Feld einen gesetzten Wert. Bei einem PATCH wuerde das
 * bedeuten, dass ein nicht uebergebenes Feld stillschweigend auf den
 * Standard zurueckfaellt – also Daten verliert.
 */
export const flagSchema = () =>
  z
    .union([z.boolean(), z.string()])
    .transform((value) =>
      typeof value === 'boolean' ? value : value === 'true' || value === '1',
    );

/** Seitenweise Abfrage fuer Listen. */
export const listQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  /** Standardmaessig bleiben archivierte Eintraege ausgeblendet. */
  includeArchived: flagSchema().default(false),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListQuery = z.infer<typeof listQuerySchema>;
