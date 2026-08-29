/**
 * Money arithmetic.
 *
 * Kernregel des Systems: Betraege leben intern ausschliesslich als
 * ganzzahlige Cent vom Typ `number`. Fliesskomma wird nur an der
 * Systemgrenze beruehrt – beim Parsen einer Nutzereingabe, beim Formatieren
 * fuer die Anzeige und beim Lesen aus der Datenbank. Alles dazwischen ist
 * Ganzzahl.
 *
 * `number` traegt Ganzzahlen exakt bis 2^53-1. Das entspricht rund
 * 90 Billionen Euro in Cent und reicht fuer diesen Anwendungsfall.
 */

/** Integer cents. */
export type Cents = number;

/**
 * Ein Verhaeltnis als Dezimalzahl: 0.35 bedeutet 35 Prozent.
 * Raten sind bewusst kein Cent-Typ – sie sind kein Geld und duerfen
 * zwischendrin volle Fliesskommagenauigkeit behalten (Regel 10).
 */
export type Rate = number;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

/** Prueft, ob ein Wert ein gueltiger Cent-Betrag ist. */
export function isCents(value: unknown): value is Cents {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    Math.abs(value) <= MAX_SAFE
  );
}

/** Wirft, wenn `value` kein gueltiger Cent-Betrag ist. */
export function assertCents(value: number, field = 'Betrag'): Cents {
  if (!isCents(value)) {
    throw new MoneyError(
      `${field} muss ein ganzzahliger Cent-Wert sein, erhalten: ${String(value)}`,
    );
  }
  return value;
}

/**
 * Kaufmaennische Rundung auf die Ganzzahl, symmetrisch um null.
 *
 * `Math.round` rundet -0.5 auf -0, also zur Null hin, waehrend +0.5 von der
 * Null weg gerundet wird. Diese Asymmetrie ist bei Gutschriften und Retouren
 * falsch, deshalb der eigene Weg ueber den Betrag.
 */
export function round(value: number): Cents {
  if (!Number.isFinite(value)) {
    throw new MoneyError(`Nicht rundbarer Wert: ${String(value)}`);
  }
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value));
}

/**
 * Wandelt Euro in Cent. Nur an der Systemgrenze verwenden.
 *
 * Der Umweg ueber `toFixed` faengt Faelle wie 19.99 * 100 =
 * 1998.9999999999998 ab, die bei direkter Multiplikation einen Cent
 * verlieren wuerden.
 */
export function eurosToCents(euros: number): Cents {
  if (!Number.isFinite(euros)) {
    throw new MoneyError(`Kein gueltiger Euro-Betrag: ${String(euros)}`);
  }
  return round(Number.parseFloat((euros * 100).toFixed(4)));
}

/** Wandelt Cent in Euro. Nur fuer Anzeige und Systemgrenze. */
export function centsToEuros(cents: Cents): number {
  assertCents(cents);
  return cents / 100;
}

/**
 * Parst eine Nutzereingabe zu Cent.
 *
 * Akzeptiert deutsche und englische Schreibweise: "1.234,56", "1,234.56",
 * "1234,56", "1234.56", "12", "-3,40", "€ 9,99". Die Unterscheidung laeuft
 * ueber das *letzte* auftretende Trennzeichen: es gilt als Dezimaltrenner,
 * alle uebrigen als Tausenderpunkte. Bei einem einzelnen Trennzeichen mit
 * genau drei Nachkommastellen ("1.234") wird es als Tausendertrenner
 * gelesen, weil das im deutschen Sprachraum die haeufigere Absicht ist.
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
  // Buchhalterische Klammerschreibweise: (12,50) bedeutet -12,50.
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
    // Genau drei Ziffern hinter einem einzelnen Punkt oder Komma:
    // Tausendertrenner, nicht Dezimaltrenner.
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

  // Nachkommastellen jenseits der zweiten werden gerundet, nicht abgeschnitten.
  const paddedFraction = (fraction + '00').slice(0, 2);
  const fractionCents = Number.parseInt(paddedFraction, 10);
  const rest =
    fraction.length > 2 ? Number.parseFloat('0.' + fraction.slice(2)) : 0;

  const cents = round(wholeNumber * 100 + fractionCents + rest);
  return negative ? -cents : cents;
}

/** Formatiert Cent als deutschen Geldstring. */
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

/** Formatiert eine Rate (0.35) als Prozentangabe ("35,0 %"). */
export function formatPercent(rate: Rate, fractionDigits = 1): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(rate);
}

/**
 * Rechnet einen Fremdwaehrungsbetrag mit eingefrorenem Kurs in Euro-Cent um.
 *
 * `rate` ist der Wert einer Einheit Fremdwaehrung in Euro: bei
 * 1 USD = 0,92 EUR lautet der Kurs 0.92. Das Ergebnis wird sofort gerundet,
 * weil es persistiert wird und damit das Ende einer Rechenkette bildet
 * (Regel 6 und 10).
 */
export function foreignToEur(foreignAmount: Cents, rate: number): Cents {
  assertCents(foreignAmount, 'Fremdwaehrungsbetrag');
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new MoneyError(
      `Wechselkurs muss groesser als null sein, erhalten: ${String(rate)}`,
    );
  }
  return round(foreignAmount * rate);
}

/** Summiert Cent-Betraege. Leere Liste ergibt 0. */
export function sum(amounts: readonly Cents[]): Cents {
  let total = 0;
  for (const amount of amounts) {
    total += assertCents(amount);
  }
  return total;
}

/**
 * Wendet eine Rate auf einen Betrag an, ohne zu runden.
 * Das Runden gehoert ans Ende der Kette, nicht hierher (Regel 10).
 */
export function share(amount: Cents, rate: Rate): number {
  assertCents(amount);
  if (!Number.isFinite(rate)) {
    throw new MoneyError(`Keine gueltige Rate: ${String(rate)}`);
  }
  return amount * rate;
}

/**
 * Verteilt einen Betrag restfrei nach Gewichten.
 *
 * Das ist die zentrale Hilfsfunktion der Nebenkostenverteilung. Naives
 * Runden jedes Einzelanteils verliert oder erfindet Cent; hier wird zuerst
 * abgerundet und der Rundungsrest anschliessend Cent fuer Cent an die
 * Positionen mit dem groessten Nachkommaanteil vergeben. Die Summe der
 * Ergebnisse entspricht damit exakt dem Eingangsbetrag.
 *
 * Bei Gleichstand entscheidet der kleinere Index, damit das Ergebnis
 * deterministisch und damit testbar bleibt.
 *
 * Sind alle Gewichte null, wird gleichmaessig verteilt – sonst waere das
 * Ergebnis undefiniert und der Betrag ginge verloren.
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
  // Zur Null hin abschneiden, damit die Verteilung bei negativen Betraegen
  // (Korrekturen, Gutschriften) spiegelbildlich zur positiven laeuft.
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
