/**
 * Umrechnung an der Datenbankgrenze.
 *
 * Postgres liefert NUMERIC als String, damit unterwegs keine Genauigkeit
 * verlorengeht. Intern rechnet die Anwendung in ganzzahligen Cent (Regel 1).
 * Diese beiden Funktionen sind die einzige Stelle, an der umgerechnet wird.
 */

/** NUMERIC-String aus der Datenbank zu Cent. */
export function numericZuCent(wert: string | null): number | null {
  if (wert === null) return null;
  const zahl = Number.parseFloat(wert);
  if (!Number.isFinite(zahl)) return null;
  // Der Umweg ueber toFixed faengt Faelle wie 19.99 * 100 ab,
  // die bei direkter Multiplikation einen Cent verlieren wuerden.
  return Math.round(Number.parseFloat((zahl * 100).toFixed(4)));
}

/** Cent zu NUMERIC-String fuer die Datenbank. */
export function centZuNumeric(cent: number | null | undefined): string | null {
  if (cent === null || cent === undefined) return null;
  return (cent / 100).toFixed(4);
}

/**
 * Dezimalsatz zu NUMERIC-String. 0.065 wird zu "0.0650".
 * Prozentsaetze sind kein Geld und werden deshalb nicht in Cent gehalten.
 */
export function satzZuNumeric(satz: number | null | undefined): string | null {
  if (satz === null || satz === undefined) return null;
  return satz.toFixed(4);
}

/** NUMERIC-String zu Dezimalsatz. */
export function numericZuSatz(wert: string | null): number | null {
  if (wert === null) return null;
  const zahl = Number.parseFloat(wert);
  return Number.isFinite(zahl) ? zahl : null;
}
