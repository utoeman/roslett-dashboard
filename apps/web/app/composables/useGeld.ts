/**
 * Formatierung fuer die Anzeige.
 *
 * Die API liefert Geldbetraege ausnahmslos als ganzzahlige Cent und
 * Prozentsaetze als Dezimalsaetze. Umgewandelt wird erst hier, unmittelbar
 * vor der Ausgabe.
 */

const geldFormat = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const zahlFormat = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function useGeld() {
  /** Cent als Euro-Betrag. `null` ergibt einen Gedankenstrich, keinen Nullwert. */
  function formatGeld(cent: number | null | undefined): string {
    if (cent === null || cent === undefined) return '–';
    return geldFormat.format(cent / 100);
  }

  /** Cent als Zahl ohne Waehrungszeichen, fuer Spalten mit eigener Kopfzeile. */
  function formatBetrag(cent: number | null | undefined): string {
    if (cent === null || cent === undefined) return '–';
    return zahlFormat.format(cent / 100);
  }

  /** Dezimalsatz als Prozentangabe. 0.065 wird zu "6,5 %". */
  function formatProzent(satz: number | null | undefined, stellen = 1): string {
    if (satz === null || satz === undefined) return '–';
    return new Intl.NumberFormat('de-DE', {
      style: 'percent',
      minimumFractionDigits: stellen,
      maximumFractionDigits: stellen,
    }).format(satz);
  }

  function formatDatum(wert: string | Date | null | undefined): string {
    if (!wert) return '–';
    const datum = typeof wert === 'string' ? new Date(wert) : wert;
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(datum);
  }

  return { formatGeld, formatBetrag, formatProzent, formatDatum };
}
