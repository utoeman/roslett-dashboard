/**
 * Umrechnung an der Datenbankgrenze.
 *
 * Postgres liefert NUMERIC als String, damit unterwegs keine Genauigkeit
 * verlorengeht. Intern rechnet die Anwendung in ganzzahligen Cent (Regel 1).
 * Diese Funktionen sind die einzige Stelle, an der umgerechnet wird.
 */

/** NUMERIC-String aus der Datenbank zu Cent. */
export function numericToCents(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  // Der Umweg ueber toFixed faengt Faelle wie 19.99 * 100 ab,
  // die bei direkter Multiplikation einen Cent verlieren wuerden.
  return Math.round(Number.parseFloat((parsed * 100).toFixed(4)));
}

/** Cent zu NUMERIC-String fuer die Datenbank. */
export function centsToNumeric(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined) return null;
  return (cents / 100).toFixed(4);
}

/**
 * Rate zu NUMERIC-String. 0.065 wird zu "0.0650".
 * Raten sind kein Geld und werden deshalb nicht in Cent gehalten.
 */
export function rateToNumeric(rate: number | null | undefined): string | null {
  if (rate === null || rate === undefined) return null;
  return rate.toFixed(4);
}

/** NUMERIC-String zu Rate. */
export function numericToRate(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}
