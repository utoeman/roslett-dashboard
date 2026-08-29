/**
 * Bausteine, die alle Schemas teilen.
 *
 * Die Schemas liegen in shared/, damit Client und Server dieselbe Definition
 * verwenden. Eine Regel, die im Formular gilt, gilt damit zwangslaeufig auch
 * in der API – sie koennen nicht auseinanderlaufen.
 */

import { z } from 'zod';

export const uuidSchema = z.uuid({ message: 'Keine gueltige Kennung.' });

/** Pflichttext mit sinnvoller Obergrenze und ohne fuehrende Leerzeichen. */
export const pflichttext = (feld: string, max = 200) =>
  z
    .string()
    .trim()
    .min(1, { message: `${feld} darf nicht leer sein.` })
    .max(max, { message: `${feld} ist zu lang (hoechstens ${max} Zeichen).` });

/** Freitext, der auch leer bleiben darf. Leerstring wird zu null. */
export const optionalerText = (max = 2000) =>
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
export const geldSchema = (feld = 'Betrag') =>
  z.union([z.number(), z.string()]).transform((wert, ctx) => {
    try {
      // Traege geladen, damit shared/ auch im Browser klein bleibt.
      const zahl =
        typeof wert === 'number'
          ? Math.round(wert * 100)
          : parseGeldEingabe(wert);
      if (!Number.isFinite(zahl)) throw new Error('nicht endlich');
      return zahl;
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: `${feld} ist kein gueltiger Betrag.`,
      });
      return z.NEVER;
    }
  });

/**
 * Kleiner Parser fuer die Systemgrenze.
 *
 * Bewusst eine eigene, schlanke Fassung statt eines Imports aus packages/core:
 * shared/ laeuft auch im Browser, und die Engine soll nicht ins Client-Bundle
 * wandern, nur damit ein Formularfeld gelesen werden kann. Die Regeln sind
 * dieselben – das letzte Trennzeichen entscheidet.
 */
function parseGeldEingabe(eingabe: string): number {
  const roh = eingabe.trim().replace(/[€$£\s]/g, '').replace(/(EUR|USD|GBP)/gi, '');
  if (roh === '') throw new Error('leer');

  let text = roh;
  let negativ = false;
  if (text.startsWith('-')) {
    negativ = true;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }
  if (!/^[\d.,]+$/.test(text)) throw new Error('ungueltig');

  const letzterPunkt = text.lastIndexOf('.');
  const letztesKomma = text.lastIndexOf(',');
  const trennerPos = Math.max(letzterPunkt, letztesKomma);

  let ganz: string;
  let bruch: string;
  if (trennerPos === -1) {
    ganz = text;
    bruch = '';
  } else {
    const nachTrenner = text.slice(trennerPos + 1);
    const trenner = text.charAt(trennerPos);
    const nurEinTrenner =
      text.indexOf(trenner) === trennerPos &&
      (trenner === '.' ? letztesKomma : letzterPunkt) === -1;
    if (nachTrenner.length === 3 && nurEinTrenner) {
      ganz = text.replace(/[.,]/g, '');
      bruch = '';
    } else {
      ganz = text.slice(0, trennerPos).replace(/[.,]/g, '');
      bruch = nachTrenner;
    }
  }

  if (!/^\d*$/.test(bruch)) throw new Error('ungueltig');
  const ganzZahl = ganz === '' ? 0 : Number.parseInt(ganz, 10);
  const bruchCent = Number.parseInt((bruch + '00').slice(0, 2), 10);
  const rest = bruch.length > 2 ? Number.parseFloat('0.' + bruch.slice(2)) : 0;
  const cent = Math.round(ganzZahl * 100 + bruchCent + rest);
  return negativ ? -cent : cent;
}

/**
 * Prozentsatz als Nutzereingabe.
 *
 * Der Nutzer tippt "6,5" und meint 6,5 Prozent. Gespeichert wird 0.065.
 * Die Umrechnung gehoert an die Systemgrenze, damit im Rest des Systems
 * ausschliesslich Dezimalsaetze kursieren.
 */
export const prozentSchema = (feld = 'Prozentsatz', maxProzent = 100) =>
  z.union([z.number(), z.string()]).transform((wert, ctx) => {
    const zahl =
      typeof wert === 'number'
        ? wert
        : Number.parseFloat(wert.trim().replace(',', '.').replace('%', ''));
    if (!Number.isFinite(zahl)) {
      ctx.addIssue({ code: 'custom', message: `${feld} ist keine gueltige Zahl.` });
      return z.NEVER;
    }
    if (zahl < 0 || zahl > maxProzent) {
      ctx.addIssue({
        code: 'custom',
        message: `${feld} muss zwischen 0 und ${maxProzent} liegen.`,
      });
      return z.NEVER;
    }
    return zahl / 100;
  });

/**
 * Wahrheitswert aus einer Abfragezeichenkette.
 *
 * `z.coerce.boolean()` ist hier unbrauchbar: es wendet die Truthiness von
 * JavaScript an, und damit wird auch "false" zu `true` – jede nicht leere
 * Zeichenkette tut das. In der Abfragezeichenkette steht aber genau dieses
 * "false", sodass ein Filter niemals greifen wuerde.
 */
export const flagSchema = (standard = false) =>
  z
    .union([z.boolean(), z.string()])
    .default(standard)
    .transform((wert) =>
      typeof wert === 'boolean' ? wert : wert === 'true' || wert === '1',
    );

/** Seitenweise Abfrage fuer Listen. */
export const listenAbfrageSchema = z.object({
  suche: z.string().trim().max(200).optional(),
  /** Standardmaessig bleiben archivierte Eintraege ausgeblendet. */
  mitArchivierten: flagSchema(false),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListenAbfrage = z.infer<typeof listenAbfrageSchema>;
