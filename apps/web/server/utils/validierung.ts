/**
 * Validierungshilfen fuer API-Routen.
 *
 * Jede schreibende Route liest ihren Rumpf ueber `leseRumpf`, jede Liste ihre
 * Abfrageparameter ueber `leseAbfrage`. So entsteht ueberall dieselbe
 * Fehlerform, ohne dass jede Route sie selbst zusammenbaut.
 */

import type { H3Event } from 'h3';
import { readBody, getQuery, getRouterParam } from 'h3';
import type { ZodType } from 'zod';
import { nichtGefunden, ungueltig, validierungsFehler } from './errors.js';

export async function leseRumpf<T>(
  event: H3Event,
  schema: ZodType<T>,
): Promise<T> {
  const rumpf = await readBody(event);
  const ergebnis = schema.safeParse(rumpf);
  if (!ergebnis.success) {
    throw validierungsFehler(ergebnis.error);
  }
  return ergebnis.data;
}

export function leseAbfrage<T>(event: H3Event, schema: ZodType<T>): T {
  const ergebnis = schema.safeParse(getQuery(event));
  if (!ergebnis.success) {
    throw validierungsFehler(ergebnis.error);
  }
  return ergebnis.data;
}

const UUID_MUSTER =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Liest eine UUID aus dem Pfad.
 *
 * Ohne diese Pruefung wuerde eine unsinnige Kennung erst in Postgres
 * auflaufen und dort einen Serverfehler statt einer klaren 400 erzeugen.
 */
export function leseId(event: H3Event, name = 'id'): string {
  const wert = getRouterParam(event, name);
  if (wert === undefined || wert === '') {
    throw ungueltig('Es wurde keine Kennung angegeben.');
  }
  if (!UUID_MUSTER.test(wert)) {
    throw ungueltig('Die angegebene Kennung ist ungueltig.');
  }
  return wert;
}

/** Wirft 404, wenn nichts gefunden wurde. Sonst gibt es den Datensatz zurueck. */
export function musstExistieren<T>(wert: T | undefined, was: string): T {
  if (wert === undefined) {
    throw nichtGefunden(was);
  }
  return wert;
}
