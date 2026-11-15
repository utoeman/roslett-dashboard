import { describe, expect, it } from 'vitest';
import {
  MoneyError,
  centsToEuros,
  formatMoney,
  formatPercent,
  isCents,
  parseMoney,
  assertCents,
  round,
  sum,
  share,
  distributeByWeight,
} from '../src/money.js';

describe('isCents und assertCents', () => {
  it('erkennt gueltige Cent-Werte', () => {
    expect(isCents(0)).toBe(true);
    expect(isCents(-1999)).toBe(true);
    expect(isCents(1999)).toBe(true);
  });

  it('lehnt Nicht-Ganzzahlen und Nicht-Zahlen ab', () => {
    expect(isCents(19.99)).toBe(false);
    expect(isCents(Number.NaN)).toBe(false);
    expect(isCents(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isCents('100')).toBe(false);
    expect(isCents(null)).toBe(false);
  });

  it('wirft mit Feldnamen im Text', () => {
    expect(() => assertCents(1.5, 'Einstandspreis')).toThrow(MoneyError);
    expect(() => assertCents(1.5, 'Einstandspreis')).toThrow(/Einstandspreis/);
    expect(assertCents(500)).toBe(500);
  });
});

describe('round', () => {
  it('rundet kaufmaennisch auf Cent (Regel 10)', () => {
    expect(round(10.4)).toBe(10);
    expect(round(10.5)).toBe(11);
    expect(round(10.6)).toBe(11);
  });

  it('rundet symmetrisch um null', () => {
    // Math.round(-0.5) would be -0.
    expect(round(-10.5)).toBe(-11);
    expect(round(-10.4)).toBe(-10);
    expect(round(-0.5)).toBe(-1);
  });

  it('lehnt nicht endliche Werte ab', () => {
    expect(() => round(Number.NaN)).toThrow(MoneyError);
    expect(() => round(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
  });
});

describe('centsToEuros', () => {
  it('wandelt zurueck', () => {
    expect(centsToEuros(1999)).toBeCloseTo(19.99, 10);
    expect(centsToEuros(-450)).toBeCloseTo(-4.5, 10);
  });

  it('lehnt Unsinn ab', () => {
    expect(() => centsToEuros(1.5)).toThrow(MoneyError);
  });
});

describe('parseMoney', () => {
  it('liest deutsche Schreibweise', () => {
    expect(parseMoney('1.234,56')).toBe(123456);
    expect(parseMoney('1234,56')).toBe(123456);
    expect(parseMoney('0,05')).toBe(5);
    expect(parseMoney('12')).toBe(1200);
  });

  it('liest englische Schreibweise', () => {
    expect(parseMoney('1,234.56')).toBe(123456);
    expect(parseMoney('1234.56')).toBe(123456);
  });

  it('behandelt einen einzelnen Trenner mit drei Ziffern als Tausender', () => {
    expect(parseMoney('1.234')).toBe(123400);
    expect(parseMoney('1,234')).toBe(123400);
  });

  it('erkennt negative Betraege in beiden Schreibweisen', () => {
    expect(parseMoney('-3,40')).toBe(-340);
    expect(parseMoney('(12,50)')).toBe(-1250);
    expect(parseMoney('+7,00')).toBe(700);
  });

  it('ignoriert Waehrungssymbole und Leerzeichen', () => {
    expect(parseMoney(' € 9,99 ')).toBe(999);
    expect(parseMoney('9,99 EUR')).toBe(999);
    expect(parseMoney('$1,000.00')).toBe(100000);
  });

  it('rundet mehr als zwei Nachkommastellen', () => {
    // Four decimals, so the thousands rule does not apply.
    expect(parseMoney('1,0050')).toBe(101);
    expect(parseMoney('1,0040')).toBe(100);
    expect(parseMoney('0,9990')).toBe(100);
    // Three digits are read as a thousands separator.
    expect(parseMoney('1,005')).toBe(100500);
  });

  it('liest einen Betrag ohne Vorkommastellen', () => {
    expect(parseMoney(',50')).toBe(50);
    expect(parseMoney('.50')).toBe(50);
  });

  it('wirft bei ungueltiger Eingabe', () => {
    expect(() => parseMoney('')).toThrow(MoneyError);
    expect(() => parseMoney('   ')).toThrow(MoneyError);
    expect(() => parseMoney('abc')).toThrow(MoneyError);
    expect(() => parseMoney('12x34')).toThrow(MoneyError);
  });
});

describe('formatMoney und formatPercent', () => {
  it('formatiert deutsch', () => {
    expect(formatMoney(123456).replace(/\u00a0/g, ' ')).toBe('1.234,56 €');
    expect(formatMoney(-500).replace(/\u00a0/g, ' ')).toBe('-5,00 €');
    expect(formatMoney(999, { withSymbol: false })).toBe('9,99');
  });

  it('formatiert Prozentsaetze', () => {
    expect(formatPercent(0.35).replace(/\u00a0/g, ' ')).toBe('35,0 %');
    expect(formatPercent(0.065, 2).replace(/\u00a0/g, ' ')).toBe('6,50 %');
  });

  it('lehnt Nicht-Cent ab', () => {
    expect(() => formatMoney(1.5)).toThrow(MoneyError);
  });
});

describe('sum und share', () => {
  it('summiert', () => {
    expect(sum([100, 250, -50])).toBe(300);
    expect(sum([])).toBe(0);
    expect(() => sum([100, 1.5])).toThrow(MoneyError);
  });

  it('bildet Anteile ohne zu runden (Regel 10)', () => {
    expect(share(1000, 0.065)).toBe(65);
    expect(share(999, 0.1)).toBeCloseTo(99.9, 10);
    expect(() => share(1000, Number.NaN)).toThrow(MoneyError);
  });
});

describe('distributeByWeight', () => {
  it('verteilt restfrei und verliert keinen Cent', () => {
    const teile = distributeByWeight(100, [1, 1, 1]);
    expect(teile.reduce((a, b) => a + b, 0)).toBe(100);
    expect(teile).toEqual([34, 33, 33]);
  });

  it('verteilt nach ungleichen Gewichten', () => {
    const teile = distributeByWeight(10000, [7000, 2000, 1000]);
    expect(teile).toEqual([7000, 2000, 1000]);
    expect(teile.reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it('vergibt den Rest deterministisch nach groesstem Bruchanteil', () => {
    // 10 cents at 1:1:1: the remaining cent goes to index 0.
    expect(distributeByWeight(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(distributeByWeight(10, [1, 1, 1])).toEqual(
      distributeByWeight(10, [1, 1, 1]),
    );
  });

  it('verteilt negative Betraege spiegelbildlich', () => {
    const teile = distributeByWeight(-100, [1, 1, 1]);
    expect(teile.reduce((a, b) => a + b, 0)).toBe(-100);
    expect(teile).toEqual([-34, -33, -33]);
  });

  it('verteilt bei lauter Null-Gewichten gleichmaessig', () => {
    const teile = distributeByWeight(99, [0, 0, 0]);
    expect(teile.reduce((a, b) => a + b, 0)).toBe(99);
    expect(teile).toEqual([33, 33, 33]);
  });

  it('verteilt einen Nullbetrag als lauter Nullen', () => {
    expect(distributeByWeight(0, [5, 3])).toEqual([0, 0]);
  });

  it('wirft ohne Positionen oder bei ungueltigen Gewichten', () => {
    expect(() => distributeByWeight(100, [])).toThrow(MoneyError);
    expect(() => distributeByWeight(100, [1, -1])).toThrow(MoneyError);
    expect(() => distributeByWeight(100, [1, Number.NaN])).toThrow(MoneyError);
    expect(() => distributeByWeight(1.5, [1])).toThrow(MoneyError);
  });
});
