/** Display formatting: cents and rates from the API, German notation. */

import { MoneyError, parseMoney } from '@roslett/core';

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
  /** `null` renders as a dash, not as zero. */
  function formatMoney(cents: number | null | undefined): string {
    if (cents === null || cents === undefined) return '–';
    return moneyFormat.format(cents / 100);
  }

  /** Minor units of any currency, e.g. 38000 TRY → "380,00 TRY". */
  function formatForeign(minor: number | null | undefined, currency: string): string {
    if (minor === null || minor === undefined) return '–';
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency, currencyDisplay: 'code' }).format(minor / 100);
  }

  /** Without currency symbol, for columns with their own header. */
  function formatAmount(cents: number | null | undefined): string {
    if (cents === null || cents === undefined) return '–';
    return numberFormat.format(cents / 100);
  }

  /** 0.065 → "6,5 %". */
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

  /** 123450 → "1.234,50"; the API reads the grouping back. */
  function toInput(cents: number | null | undefined): string {
    if (cents === null || cents === undefined) return '';
    return numberFormat.format(cents / 100);
  }

  /** Normalises a typed amount ("1234,5" → "1.234,50"); invalid text stays for the server to report. */
  function tidyInput(text: string): string {
    if (text.trim() === '') return text;
    try {
      return toInput(parseMoney(text));
    } catch (error) {
      if (error instanceof MoneyError) return text;
      throw error;
    }
  }

  /** 0.065 → "6,5". */
  function rateToInput(rate: number | null | undefined): string {
    if (rate === null || rate === undefined || rate === 0) return '';
    return String(Number((rate * 100).toFixed(4))).replace('.', ',');
  }

  return {
    formatMoney,
    formatForeign,
    formatAmount,
    formatPercent,
    formatDate,
    toInput,
    tidyInput,
    rateToInput,
  };
}
