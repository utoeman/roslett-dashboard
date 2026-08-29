import { describe, expect, it } from 'vitest';
import {
  GeldFehler,
  centZuEuro,
  euroZuCent,
  formatGeld,
  formatProzent,
  fremdZuEur,
  istCent,
  parseGeld,
  pruefeCent,
  runde,
  summe,
  anteil,
  verteileNachGewicht,
} from '../src/money.js';

describe('istCent und pruefeCent', () => {
  it('erkennt gueltige Cent-Werte', () => {
    expect(istCent(0)).toBe(true);
    expect(istCent(-1999)).toBe(true);
    expect(istCent(1999)).toBe(true);
  });

  it('lehnt Nicht-Ganzzahlen und Nicht-Zahlen ab', () => {
    expect(istCent(19.99)).toBe(false);
    expect(istCent(Number.NaN)).toBe(false);
    expect(istCent(Number.POSITIVE_INFINITY)).toBe(false);
    expect(istCent('100')).toBe(false);
    expect(istCent(null)).toBe(false);
  });

  it('wirft mit Feldnamen im Text', () => {
    expect(() => pruefeCent(1.5, 'Einstandspreis')).toThrow(GeldFehler);
    expect(() => pruefeCent(1.5, 'Einstandspreis')).toThrow(/Einstandspreis/);
    expect(pruefeCent(500)).toBe(500);
  });
});

describe('runde', () => {
  it('rundet kaufmaennisch auf Cent (Regel 10)', () => {
    expect(runde(10.4)).toBe(10);
    expect(runde(10.5)).toBe(11);
    expect(runde(10.6)).toBe(11);
  });

  it('rundet symmetrisch um null', () => {
    // Math.round(-0.5) waere -0, also zur Null hin. Bei Gutschriften falsch.
    expect(runde(-10.5)).toBe(-11);
    expect(runde(-10.4)).toBe(-10);
    expect(runde(-0.5)).toBe(-1);
  });

  it('lehnt nicht endliche Werte ab', () => {
    expect(() => runde(Number.NaN)).toThrow(GeldFehler);
    expect(() => runde(Number.POSITIVE_INFINITY)).toThrow(GeldFehler);
  });
});

describe('euroZuCent und centZuEuro', () => {
  it('wandelt ohne Fliesskommaverlust', () => {
    // 19.99 * 100 ergibt in IEEE-754 1998.9999999999998.
    expect(euroZuCent(19.99)).toBe(1999);
    expect(euroZuCent(0.1 + 0.2)).toBe(30);
    expect(euroZuCent(1234.567)).toBe(123457);
    expect(euroZuCent(-4.5)).toBe(-450);
    expect(euroZuCent(0)).toBe(0);
  });

  it('wandelt zurueck', () => {
    expect(centZuEuro(1999)).toBeCloseTo(19.99, 10);
    expect(centZuEuro(-450)).toBeCloseTo(-4.5, 10);
  });

  it('lehnt Unsinn ab', () => {
    expect(() => euroZuCent(Number.NaN)).toThrow(GeldFehler);
    expect(() => centZuEuro(1.5)).toThrow(GeldFehler);
  });
});

describe('parseGeld', () => {
  it('liest deutsche Schreibweise', () => {
    expect(parseGeld('1.234,56')).toBe(123456);
    expect(parseGeld('1234,56')).toBe(123456);
    expect(parseGeld('0,05')).toBe(5);
    expect(parseGeld('12')).toBe(1200);
  });

  it('liest englische Schreibweise', () => {
    expect(parseGeld('1,234.56')).toBe(123456);
    expect(parseGeld('1234.56')).toBe(123456);
  });

  it('behandelt einen einzelnen Trenner mit drei Ziffern als Tausender', () => {
    expect(parseGeld('1.234')).toBe(123400);
    expect(parseGeld('1,234')).toBe(123400);
  });

  it('erkennt negative Betraege in beiden Schreibweisen', () => {
    expect(parseGeld('-3,40')).toBe(-340);
    expect(parseGeld('(12,50)')).toBe(-1250);
    expect(parseGeld('+7,00')).toBe(700);
  });

  it('ignoriert Waehrungssymbole und Leerzeichen', () => {
    expect(parseGeld(' € 9,99 ')).toBe(999);
    expect(parseGeld('9,99 EUR')).toBe(999);
    expect(parseGeld('$1,000.00')).toBe(100000);
  });

  it('rundet mehr als zwei Nachkommastellen', () => {
    // Vier Nachkommastellen, damit nicht die Tausenderregel greift.
    expect(parseGeld('1,0050')).toBe(101);
    expect(parseGeld('1,0040')).toBe(100);
    expect(parseGeld('0,9990')).toBe(100);
    // Drei Nachkommastellen sind dagegen bewusst ein Tausendertrenner.
    expect(parseGeld('1,005')).toBe(100500);
  });

  it('liest einen Betrag ohne Vorkommastellen', () => {
    expect(parseGeld(',50')).toBe(50);
    expect(parseGeld('.50')).toBe(50);
  });

  it('wirft bei ungueltiger Eingabe', () => {
    expect(() => parseGeld('')).toThrow(GeldFehler);
    expect(() => parseGeld('   ')).toThrow(GeldFehler);
    expect(() => parseGeld('abc')).toThrow(GeldFehler);
    expect(() => parseGeld('12x34')).toThrow(GeldFehler);
  });
});

describe('formatGeld und formatProzent', () => {
  it('formatiert deutsch', () => {
    expect(formatGeld(123456).replace(/ /g, ' ')).toBe('1.234,56 €');
    expect(formatGeld(-500).replace(/ /g, ' ')).toBe('-5,00 €');
    expect(formatGeld(999, { mitSymbol: false })).toBe('9,99');
  });

  it('formatiert Prozentsaetze', () => {
    expect(formatProzent(0.35).replace(/ /g, ' ')).toBe('35,0 %');
    expect(formatProzent(0.065, 2).replace(/ /g, ' ')).toBe('6,50 %');
  });

  it('lehnt Nicht-Cent ab', () => {
    expect(() => formatGeld(1.5)).toThrow(GeldFehler);
  });
});

describe('fremdZuEur (Regel 6)', () => {
  it('rechnet Fremdwaehrung mit eingefrorenem Kurs um', () => {
    // 250,00 USD bei 1 USD = 0,92 EUR ergibt 230,00 EUR.
    expect(fremdZuEur(25000, 0.92)).toBe(23000);
  });

  it('rundet das Ergebnis sofort, weil es persistiert wird', () => {
    // 99,99 USD * 0,9134 = 91,330... EUR
    expect(fremdZuEur(9999, 0.9134)).toBe(9133);
    expect(fremdZuEur(1, 0.005)).toBe(0);
    expect(fremdZuEur(1, 1.5)).toBe(2);
  });

  it('lehnt Kurse von null oder darunter ab', () => {
    expect(() => fremdZuEur(1000, 0)).toThrow(GeldFehler);
    expect(() => fremdZuEur(1000, -1)).toThrow(GeldFehler);
    expect(() => fremdZuEur(1000, Number.NaN)).toThrow(GeldFehler);
  });

  it('lehnt Nicht-Cent-Betraege ab', () => {
    expect(() => fremdZuEur(10.5, 1)).toThrow(GeldFehler);
  });
});

describe('summe und anteil', () => {
  it('summiert', () => {
    expect(summe([100, 250, -50])).toBe(300);
    expect(summe([])).toBe(0);
    expect(() => summe([100, 1.5])).toThrow(GeldFehler);
  });

  it('bildet Anteile ohne zu runden (Regel 10)', () => {
    expect(anteil(1000, 0.065)).toBe(65);
    expect(anteil(999, 0.1)).toBeCloseTo(99.9, 10);
    expect(() => anteil(1000, Number.NaN)).toThrow(GeldFehler);
  });
});

describe('verteileNachGewicht', () => {
  it('verteilt restfrei und verliert keinen Cent', () => {
    const teile = verteileNachGewicht(100, [1, 1, 1]);
    expect(teile.reduce((a, b) => a + b, 0)).toBe(100);
    expect(teile).toEqual([34, 33, 33]);
  });

  it('verteilt nach ungleichen Gewichten', () => {
    const teile = verteileNachGewicht(10000, [7000, 2000, 1000]);
    expect(teile).toEqual([7000, 2000, 1000]);
    expect(teile.reduce((a, b) => a + b, 0)).toBe(10000);
  });

  it('vergibt den Rest deterministisch nach groesstem Bruchanteil', () => {
    // 10 Cent auf Gewichte 1:1:1 ergibt je 3,333 – der Rest von 1 geht an Index 0.
    expect(verteileNachGewicht(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(verteileNachGewicht(10, [1, 1, 1])).toEqual(
      verteileNachGewicht(10, [1, 1, 1]),
    );
  });

  it('verteilt negative Betraege spiegelbildlich', () => {
    const teile = verteileNachGewicht(-100, [1, 1, 1]);
    expect(teile.reduce((a, b) => a + b, 0)).toBe(-100);
    expect(teile).toEqual([-34, -33, -33]);
  });

  it('verteilt bei lauter Null-Gewichten gleichmaessig', () => {
    const teile = verteileNachGewicht(99, [0, 0, 0]);
    expect(teile.reduce((a, b) => a + b, 0)).toBe(99);
    expect(teile).toEqual([33, 33, 33]);
  });

  it('verteilt einen Nullbetrag als lauter Nullen', () => {
    expect(verteileNachGewicht(0, [5, 3])).toEqual([0, 0]);
  });

  it('wirft ohne Positionen oder bei ungueltigen Gewichten', () => {
    expect(() => verteileNachGewicht(100, [])).toThrow(GeldFehler);
    expect(() => verteileNachGewicht(100, [1, -1])).toThrow(GeldFehler);
    expect(() => verteileNachGewicht(100, [1, Number.NaN])).toThrow(GeldFehler);
    expect(() => verteileNachGewicht(1.5, [1])).toThrow(GeldFehler);
  });
});
