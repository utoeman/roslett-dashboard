/**
 * Einheitliche Fehlerantworten.
 *
 * Jede API-Route meldet Fehler in derselben Form, damit die Oberflaeche sie
 * ohne Sonderfaelle anzeigen kann:
 *
 *   { statusCode, statusMessage, data: { fehler, felder? } }
 *
 * `felder` traegt bei Validierungsfehlern die Meldung je Formularfeld, sodass
 * das Formular sie direkt am richtigen Eingabefeld anzeigen kann.
 */

import { createError, type H3Error } from 'h3';
import type { ZodError } from 'zod';

/** Feldbezogene Fehlermeldungen, Schluessel ist der Feldpfad. */
export type Feldfehler = Record<string, string>;

/**
 * Wandelt einen Zod-Fehler in eine Antwort mit Feldbezug.
 *
 * Verschachtelte Pfade werden mit Punkt zusammengesetzt ("varianten.0.sku"),
 * damit das Formular auch Felder in Listen findet.
 */
export function validierungsFehler(fehler: ZodError): H3Error {
  const felder: Feldfehler = {};
  for (const problem of fehler.issues) {
    const pfad = problem.path.join('.') || '_';
    // Die erste Meldung je Feld gewinnt; weitere sind meist Folgefehler.
    if (felder[pfad] === undefined) {
      felder[pfad] = problem.message;
    }
  }
  return createError({
    statusCode: 422,
    statusMessage: 'Ungueltige Eingabe',
    data: {
      fehler: 'Die Eingabe konnte nicht verarbeitet werden.',
      felder,
    },
  });
}

/** Angefragter Datensatz existiert nicht. */
export function nichtGefunden(was: string): H3Error {
  return createError({
    statusCode: 404,
    statusMessage: 'Nicht gefunden',
    data: { fehler: `${was} wurde nicht gefunden.` },
  });
}

/**
 * Fachlicher Konflikt: die Anfrage ist formal richtig, widerspricht aber dem
 * aktuellen Zustand. Etwa eine SKU, die es schon gibt.
 */
export function konflikt(nachricht: string, felder?: Feldfehler): H3Error {
  return createError({
    statusCode: 409,
    statusMessage: 'Konflikt',
    data: { fehler: nachricht, ...(felder ? { felder } : {}) },
  });
}

/** Anfrage ist grundsaetzlich fehlerhaft, unabhaengig vom Zustand. */
export function ungueltig(nachricht: string, felder?: Feldfehler): H3Error {
  return createError({
    statusCode: 400,
    statusMessage: 'Ungueltige Anfrage',
    data: { fehler: nachricht, ...(felder ? { felder } : {}) },
  });
}

/**
 * Postgres-Fehlercode fuer eine verletzte Eindeutigkeit.
 * Wird gebraucht, um "SKU schon vergeben" von einem echten Serverfehler
 * zu unterscheiden.
 */
const UNIQUE_VERLETZUNG = '23505';

/**
 * Sucht den urspruenglichen Postgres-Fehler in der Ursachenkette.
 *
 * Drizzle verpackt den Treiberfehler in einen eigenen und haengt das Original
 * an `cause`. Wer nur die oberste Ebene prueft, sieht den Fehlercode nie und
 * meldet eine doppelte Artikelnummer faelschlich als Serverfehler.
 */
function findePostgresFehler(
  fehler: unknown,
): { code?: string; detail?: string } | undefined {
  let aktuell: unknown = fehler;
  // Die Kette ist kurz; die Grenze schuetzt nur vor einem Zirkelbezug.
  for (let tiefe = 0; tiefe < 10 && aktuell !== null && aktuell !== undefined; tiefe += 1) {
    if (typeof aktuell === 'object' && 'code' in aktuell) {
      const code = (aktuell as { code?: unknown }).code;
      if (typeof code === 'string') {
        return aktuell as { code?: string; detail?: string };
      }
    }
    aktuell =
      typeof aktuell === 'object' && aktuell !== null && 'cause' in aktuell
        ? (aktuell as { cause?: unknown }).cause
        : undefined;
  }
  return undefined;
}

export function istEindeutigkeitsfehler(fehler: unknown): boolean {
  return findePostgresFehler(fehler)?.code === UNIQUE_VERLETZUNG;
}

/**
 * Uebersetzt einen Datenbankfehler in eine verstaendliche Antwort, soweit
 * moeglich. Alles Unbekannte wird durchgereicht, damit echte Fehler nicht
 * hinter einer freundlichen Meldung verschwinden.
 */
export function datenbankFehler(fehler: unknown, kontext: string): H3Error {
  const pgFehler = findePostgresFehler(fehler);
  if (pgFehler?.code === UNIQUE_VERLETZUNG) {
    const detail = String(pgFehler.detail ?? '');
    // Postgres nennt die betroffene Spalte im Detailtext.
    if (detail.includes('sku')) {
      return konflikt('Diese Artikelnummer ist bereits vergeben.', {
        sku: 'Bereits vergeben.',
      });
    }
    return konflikt(`${kontext}: Dieser Eintrag existiert bereits.`);
  }
  throw fehler;
}
