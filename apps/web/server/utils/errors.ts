/**
 * Uniform error responses: { statusCode, statusMessage, data: { fehler, felder? } }.
 * The German keys are shown in the UI as-is and mapped to form fields.
 */

import { createError, type H3Error } from 'h3';
import type { ZodError } from 'zod';

/** Messages per field path. */
export type FieldErrors = Record<string, string>;

/** Zod error to a 422 with field paths joined by dots ("variants.0.sku"). */
export function validationError(error: ZodError): H3Error {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_';
    // First message per field wins; later ones are usually follow-ups.
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

export function notFound(what: string): H3Error {
  return createError({
    statusCode: 404,
    statusMessage: 'Nicht gefunden',
    data: { fehler: `${what} wurde nicht gefunden.` },
  });
}

/** Valid request that conflicts with the current state, e.g. a duplicate SKU. */
export function conflict(message: string, fields?: FieldErrors): H3Error {
  return createError({
    statusCode: 409,
    statusMessage: 'Konflikt',
    data: { fehler: message, ...(fields ? { felder: fields } : {}) },
  });
}

export function badRequest(message: string, fields?: FieldErrors): H3Error {
  return createError({
    statusCode: 400,
    statusMessage: 'Ungueltige Anfrage',
    data: { fehler: message, ...(fields ? { felder: fields } : {}) },
  });
}

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

/** Drizzle wraps the driver error; the Postgres code sits in the `cause` chain. */
function findPostgresError(
  error: unknown,
): { code?: string; detail?: string } | undefined {
  let current: unknown = error;
  // Depth limit only guards against cycles.
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

export function isForeignKeyViolation(error: unknown): boolean {
  return findPostgresError(error)?.code === FOREIGN_KEY_VIOLATION;
}

/** Translates known database errors; anything else is rethrown. */
export function databaseError(error: unknown, context: string): H3Error {
  const pgError = findPostgresError(error);
  if (pgError?.code === UNIQUE_VIOLATION) {
    const detail = String(pgError.detail ?? '');
    // Postgres names the column in the detail text.
    if (detail.includes('sku')) {
      return conflict('Diese Variante (gleiche Farbe und Größe) gibt es schon.', {
        size: 'Gibt es schon.',
      });
    }
    return conflict(`${context}: Dieser Eintrag existiert bereits.`);
  }
  throw error;
}
