/**
 * Validierungshilfen fuer API-Routen.
 *
 * Jede schreibende Route liest ihren Rumpf ueber `readJsonBody`, jede Liste ihre
 * Abfrageparameter ueber `readQuery`. So entsteht ueberall dieselbe
 * Fehlerform, ohne dass jede Route sie selbst zusammenbaut.
 *
 * Der Name lautet bewusst nicht `readBody`: Nitro stellt eine gleichnamige
 * Funktion automatisch bereit, und die eigene wuerde sie ueberdecken.
 */

import type { H3Event } from 'h3';
import { readBody as h3ReadBody, getQuery, getRouterParam } from 'h3';
import type { ZodType } from 'zod';
import { badRequest, notFound, validationError } from './errors.js';

export async function readJsonBody<T>(
  event: H3Event,
  schema: ZodType<T>,
): Promise<T> {
  const body = await h3ReadBody(event);
  const result = schema.safeParse(body);
  if (!result.success) {
    throw validationError(result.error);
  }
  return result.data;
}

export function readQuery<T>(event: H3Event, schema: ZodType<T>): T {
  const result = schema.safeParse(getQuery(event));
  if (!result.success) {
    throw validationError(result.error);
  }
  return result.data;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Liest eine UUID aus dem Pfad.
 *
 * Ohne diese Pruefung wuerde eine unsinnige Kennung erst in Postgres
 * auflaufen und dort einen Serverfehler statt einer klaren 400 erzeugen.
 */
export function readId(event: H3Event, name = 'id'): string {
  const value = getRouterParam(event, name);
  if (value === undefined || value === '') {
    throw badRequest('Es wurde keine Kennung angegeben.');
  }
  if (!UUID_PATTERN.test(value)) {
    throw badRequest('Die angegebene Kennung ist ungueltig.');
  }
  return value;
}

/** Wirft 404, wenn nichts gefunden wurde. Sonst gibt es den Datensatz zurueck. */
export function requireFound<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw notFound(what);
  }
  return value;
}
