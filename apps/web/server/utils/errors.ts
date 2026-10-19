/**
 * Einheitliche Fehlerantworten.
 *
 * Jede API-Route meldet Fehler in derselben Form, damit die Oberflaeche sie
 * ohne Sonderfaelle anzeigen kann:
 *
 *   { statusCode, statusMessage, data: { fehler, felder? } }
 *
 * Die Schluessel `fehler` und `felder` sind bewusst deutsch: sie werden
 * unveraendert in der Oberflaeche angezeigt und dort Formularfeldern
 * zugeordnet.
 */

import { createError, type H3Error } from 'h3';
import type { ZodError } from 'zod';

/** Feldbezogene Fehlermeldungen, Schluessel ist der Feldpfad. */
export type FieldErrors = Record<string, string>;

/**
 * Wandelt einen Zod-Fehler in eine Antwort mit Feldbezug.
 *
 * Verschachtelte Pfade werden mit Punkt zusammengesetzt ("variants.0.sku"),
 * damit das Formular auch Felder in Listen findet.
 */
export function validationError(error: ZodError): H3Error {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_';
    // Die erste Meldung je Feld gewinnt; weitere sind meist Folgefehler.
    if (fields[path] === undefined) {
      fields[path] = issue.message;
    }
  }
  return createError({
    statusCode: 422,
    statusMessage: 'Ungueltige Eingabe',
    data: {
      fehler: 'Die Eingabe konnte nicht verarbeitet werden.',
      felder: fields,
    },
  });
}

/** Angefragter Datensatz existiert nicht. */
export function notFound(what: string): H3Error {
  return createError({
    statusCode: 404,
    statusMessage: 'Nicht gefunden',
    data: { fehler: `${what} wurde nicht gefunden.` },
  });
}

/**
 * Fachlicher Konflikt: die Anfrage ist formal richtig, widerspricht aber dem
 * aktuellen Zustand. Etwa eine SKU, die es schon gibt.
 */
export function conflict(message: string, fields?: FieldErrors): H3Error {
  return createError({
    statusCode: 409,
    statusMessage: 'Konflikt',
    data: { fehler: message, ...(fields ? { felder: fields } : {}) },
  });
}

/** Anfrage ist grundsaetzlich fehlerhaft, unabhaengig vom Zustand. */
export function badRequest(message: string, fields?: FieldErrors): H3Error {
  return createError({
    statusCode: 400,
    statusMessage: 'Ungueltige Anfrage',
    data: { fehler: message, ...(fields ? { felder: fields } : {}) },
  });
}

/** Postgres-Fehlercode fuer eine verletzte Eindeutigkeit. */
const UNIQUE_VIOLATION = '23505';

/**
 * Sucht den urspruenglichen Postgres-Fehler in der Ursachenkette.
 *
 * Drizzle verpackt den Treiberfehler in einen eigenen und haengt das
 * Original an `cause`. Wer nur die oberste Ebene prueft, sieht den
 * Fehlercode nie und meldet eine doppelte Artikelnummer faelschlich als
 * Serverfehler.
 */
function findPostgresError(
  error: unknown,
): { code?: string; detail?: string } | undefined {
  let current: unknown = error;
  // Die Kette ist kurz; die Grenze schuetzt nur vor einem Zirkelbezug.
  for (let depth = 0; depth < 10 && current !== null && current !== undefined; depth += 1) {
    if (typeof current === 'object' && 'code' in current) {
      const code = (current as { code?: unknown }).code;
      if (typeof code === 'string') {
        return current as { code?: string; detail?: string };
      }
    }
    current =
      typeof current === 'object' && current !== null && 'cause' in current
        ? (current as { cause?: unknown }).cause
        : undefined;
  }
  return undefined;
}

export function isUniqueViolation(error: unknown): boolean {
  return findPostgresError(error)?.code === UNIQUE_VIOLATION;
}

/**
 * Uebersetzt einen Datenbankfehler in eine verstaendliche Antwort, soweit
 * moeglich. Alles Unbekannte wird durchgereicht, damit echte Fehler nicht
 * hinter einer freundlichen Meldung verschwinden.
 */
export function databaseError(error: unknown, context: string): H3Error {
  const pgError = findPostgresError(error);
  if (pgError?.code === UNIQUE_VIOLATION) {
    const detail = String(pgError.detail ?? '');
    // Postgres nennt die betroffene Spalte im Detailtext.
    if (detail.includes('sku')) {
      return conflict('Diese SKU ist bereits vergeben.', {
        sku: 'Bereits vergeben.',
      });
    }
    return conflict(`${context}: Dieser Eintrag existiert bereits.`);
  }
  throw error;
}
