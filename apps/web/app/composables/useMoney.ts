/**
 * Formatierung fuer die Anzeige.
 *
 * Die API liefert Geldbetraege ausnahmslos als ganzzahlige Cent und
 * Prozentsaetze als Raten. Umgewandelt wird erst hier, unmittelbar vor der
 * Ausgabe – und immer in deutscher Schreibweise, weil es angezeigt wird.
 */

const moneyFormat = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormat = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function useMoney() {
  /** Cent als Euro-Betrag. `null` ergibt einen Gedankenstrich, keinen Nullwert. */
  function formatMoney(cents: number | null | undefined): string {
    if (cents === null || cents === undefined) return '–';
    return moneyFormat.format(cents / 100);
  }

  /** Cent als Zahl ohne Waehrungszeichen, fuer Spalten mit eigener Kopfzeile. */
  function formatAmount(cents: number | null | undefined): string {
    if (cents === null || cents === undefined) return '–';
    return numberFormat.format(cents / 100);
  }

  /** Rate als Prozentangabe. 0.065 wird zu "6,5 %". */
  function formatPercent(rate: number | null | undefined, digits = 1): string {
    if (rate === null || rate === undefined) return '–';
    return new Intl.NumberFormat('de-DE', {
      style: 'percent',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(rate);
  }

  function formatDate(value: string | Date | null | undefined): string {
    if (!value) return '–';
    const date = typeof value === 'string' ? new Date(value) : value;
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  }

  /** Cent zurueck ins Eingabeformat: 2150 wird zu "21,50". */
  function toInput(cents: number | null | undefined): string {
    if (cents === null || cents === undefined) return '';
    return (cents / 100).toFixed(2).replace('.', ',');
  }

  /** Rate zurueck ins Eingabeformat: 0.065 wird zu "6,5". */
  function rateToInput(rate: number | null | undefined): string {
    if (rate === null || rate === undefined || rate === 0) return '';
    return String(Number((rate * 100).toFixed(4))).replace('.', ',');
  }

  return {
    formatMoney,
    formatAmount,
    formatPercent,
    formatDate,
    toInput,
    rateToInput,
  };
}
