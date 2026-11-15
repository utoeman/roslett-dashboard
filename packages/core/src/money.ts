/**
 * Money arithmetic.
 *
 * Amounts are integer cents (`number`, exact up to 2^53-1). Floating point is
 * only touched at the boundary: parsing input, formatting, reading the DB.
 */

/** Integer cents. */
export type Cents = number;

/** A ratio, 0.35 = 35 %. Not money, so it keeps full precision. */
export type Rate = number;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

export function isCents(value: unknown): value is Cents {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    Math.abs(value) <= MAX_SAFE
  );
}

export function assertCents(value: number, field = 'Betrag'): Cents {
  if (!isCents(value)) {
    throw new MoneyError(
      `${field} muss ein ganzzahliger Cent-Wert sein, erhalten: ${String(value)}`,
    );
  }
  return value;
}

/**
 * Round half away from zero. `Math.round(-0.5)` gives -0, which would be
 * wrong for credits and returns.
 */
export function round(value: number): Cents {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`Nicht rundbarer Wert: ${String(value)}`);
  }
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value));
}

/** Boundary and display only. */
export function centsToEuros(cents: Cents): number {
  assertCents(cents);
  return cents / 100;
}

/**
 * Parses user input in German or English notation ("1.234,56", "1,234.56",
 * "-3,40", "€ 9,99"). The last separator is the decimal one; a single
 * separator followed by exactly three digits ("1.234") is read as thousands.
 */
export function parseMoney(input: string): Cents {
  const raw = input.trim();
  if (raw === '') {
    throw new MoneyError('Leere Eingabe ist kein Betrag.');
  }

  let text = raw.replace(/[€$£\s]/g, '').replace(/(EUR|USD|GBP)/gi, '');

  let negative = false;
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }
  // Accounting notation: (12,50) means -12,50.
  if (text.startsWith('(') && text.endsWith(')')) {
    negative = true;
    text = text.slice(1, -1);
  }

  if (!/^[\d.,]+$/.test(text)) {
    throw new MoneyError(`Kein gueltiger Betrag: "${input}"`);
  }

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  const separatorAt = Math.max(lastDot, lastComma);

  let whole: string;
  let fraction: string;

  if (separatorAt === -1) {
    whole = text;
    fraction = '';
  } else {
    const afterSeparator = text.slice(separatorAt + 1);
    const separator = text.charAt(separatorAt);
    const singleSeparator =
      text.indexOf(separator) === separatorAt &&
      (separator === '.' ? lastComma : lastDot) === -1;
    if (afterSeparator.length === 3 && singleSeparator) {
      whole = text.replace(/[.,]/g, '');
      fraction = '';
    } else {
      whole = text.slice(0, separatorAt).replace(/[.,]/g, '');
      fraction = afterSeparator;
    }
  }

  if (!/^\d*$/.test(fraction)) {
    throw new MoneyError(`Kein gueltiger Betrag: "${input}"`);
  }

  const wholeNumber = whole === '' ? 0 : Number.parseInt(whole, 10);
  if (!Number.isFinite(wholeNumber)) {
    throw new MoneyError(`Kein gueltiger Betrag: "${input}"`);
  }

  // Digits beyond the second are rounded, not truncated.
  const paddedFraction = (fraction + '00').slice(0, 2);
  const fractionCents = Number.parseInt(paddedFraction, 10);
  const rest =
    fraction.length > 2 ? Number.parseFloat('0.' + fraction.slice(2)) : 0;

  const cents = round(wholeNumber * 100 + fractionCents + rest);
  return negative ? -cents : cents;
}

export function formatMoney(
  cents: Cents,
  options: { currency?: string; withSymbol?: boolean } = {},
): string {
  assertCents(cents);
  const { currency = 'EUR', withSymbol = true } = options;
  return new Intl.NumberFormat('de-DE', {
    style: withSymbol ? 'currency' : 'decimal',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** 0.35 → "35,0 %". */
export function formatPercent(rate: Rate, fractionDigits = 1): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(rate);
}

export function sum(amounts: readonly Cents[]): Cents {
  let total = 0;
  for (const amount of amounts) {
    total += assertCents(amount);
  }
  return total;
}

/** Applies a rate without rounding; rounding belongs at the end of a chain. */
export function share(amount: Cents, rate: Rate): number {
  assertCents(amount);
  if (!Number.isFinite(rate)) {
    throw new MoneyError(`Keine gueltige Rate: ${String(rate)}`);
  }
  return amount * rate;
}

/**
 * Splits an amount by weights without losing or inventing cents (largest
 * remainder method). Ties go to the lower index; all-zero weights split evenly.
 */
export function distributeByWeight(
  amount: Cents,
  weights: readonly number[],
): Cents[] {
  assertCents(amount, 'Zu verteilender Betrag');
  if (weights.length === 0) {
    throw new MoneyError('Ohne Positionen laesst sich kein Betrag verteilen.');
  }
  for (const weight of weights) {
    if (!Number.isFinite(weight) || weight < 0) {
      throw new MoneyError(
        `Gewicht muss endlich und nicht negativ sein, erhalten: ${String(weight)}`,
      );
    }
  }

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const effective = totalWeight === 0 ? weights.map(() => 1) : (weights as number[]);
  const effectiveTotal = totalWeight === 0 ? weights.length : totalWeight;

  const exact = effective.map((w) => (amount * w) / effectiveTotal);
  // Truncate toward zero so negative amounts mirror positive ones.
  const floored = exact.map((v) => Math.trunc(v));
  const distributed = floored.reduce((a, b) => a + b, 0);
  let rest = amount - distributed;

  const byFraction = exact
    .map((v, i) => ({ i, fraction: Math.abs(v - Math.trunc(v)) }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i);

  const result = [...floored];
  const step = rest < 0 ? -1 : 1;
  let position = 0;
  while (rest !== 0) {
    const entry = byFraction[position % byFraction.length];
    /* c8 ignore next */
    if (entry === undefined) break;
    result[entry.i] = (result[entry.i] ?? 0) + step;
    rest -= step;
    position += 1;
  }

  return result;
}
