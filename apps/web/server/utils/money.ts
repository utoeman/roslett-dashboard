/**
 * Conversion at the database boundary: Postgres returns NUMERIC as a string,
 * the app works in integer cents.
 */

export function numericToCents(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  // toFixed avoids losing a cent on 19.99 * 100.
  return Math.round(Number.parseFloat((parsed * 100).toFixed(4)));
}

export function centsToNumeric(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined) return null;
  return (cents / 100).toFixed(4);
}

/** 0.065 → "0.0650". Rates are not money and stay unrounded. */
export function rateToNumeric(rate: number | null | undefined): string | null {
  if (rate === null || rate === undefined) return null;
  return rate.toFixed(4);
}

export function numericToRate(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}
