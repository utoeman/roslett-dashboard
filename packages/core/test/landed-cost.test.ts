import { describe, expect, it } from 'vitest';
import {
  VerteilungsFehler,
  einstandspreisJeStueck,
  verteileNebenkosten,
} from '../src/landed-cost.js';
import { fremdZuEur } from '../src/money.js';
import type { ChargePosition, Nebenkosten } from '../src/types.js';

const pos = (
  id: string,
  menge: number,
  warenwertEur: number,
): ChargePosition => ({ id, varianteId: `v-${id}`, menge, warenwertEur });

describe('verteileNebenkosten – drei Artikel mit stark unterschiedlichen Werten', () => {
  // Eine Sendung mit einem teuren, einem mittleren und einem billigen Artikel.
  // Genau hier zeigt sich, warum nach Wert und nicht nach Stueckzahl verteilt
  // wird: die 200 Billigteile wuerden sonst fast die gesamte Fracht tragen.
  const positionen = [
    pos('teuer', 2, 180000), // 900,00 EUR je Stueck
    pos('mittel', 10, 45000), //  45,00 EUR je Stueck
    pos('billig', 200, 20000), //   1,00 EUR je Stueck
  ];
  const warenwertGesamt = 180000 + 45000 + 20000; // 2.450,00 EUR

  it('verteilt nach Warenwert und verliert keinen Cent', () => {
    const fracht: Nebenkosten[] = [
      { bezeichnung: 'Seefracht', betragEur: 49000, verteilmethode: 'wert' },
    ];
    const e = verteileNebenkosten(positionen, fracht);

    expect(e.warenwertGesamtEur).toBe(warenwertGesamt);
    expect(e.nebenkostenGesamtEur).toBe(49000);

    const verteilt = e.positionen.map((p) => p.nebenkostenEur);
    expect(verteilt.reduce((a, b) => a + b, 0)).toBe(49000);

    // 490,00 EUR auf 2.450,00 EUR Warenwert sind genau 20 Prozent.
    expect(verteilt).toEqual([36000, 9000, 4000]);
  });

  it('verteilt nach Stueckzahl, wenn die Position das vorsieht', () => {
    const verpackung: Nebenkosten[] = [
      { bezeichnung: 'Verpackung', betragEur: 21200, verteilmethode: 'stueckzahl' },
    ];
    const e = verteileNebenkosten(positionen, verpackung);
    const verteilt = e.positionen.map((p) => p.nebenkostenEur);

    // 212 Stueck, 212,00 EUR – exakt 1,00 EUR je Stueck.
    expect(verteilt).toEqual([200, 1000, 20000]);
    expect(verteilt.reduce((a, b) => a + b, 0)).toBe(21200);
  });

  it('mischt beide Methoden in einer Sendung', () => {
    const nk: Nebenkosten[] = [
      { bezeichnung: 'Seefracht', betragEur: 49000, verteilmethode: 'wert' },
      { bezeichnung: 'Zoll', betragEur: 12250, verteilmethode: 'wert' },
      { bezeichnung: 'Verpackung', betragEur: 21200, verteilmethode: 'stueckzahl' },
    ];
    const e = verteileNebenkosten(positionen, nk);
    const summeVerteilt = e.positionen.reduce((s, p) => s + p.nebenkostenEur, 0);

    expect(e.nebenkostenGesamtEur).toBe(49000 + 12250 + 21200);
    expect(summeVerteilt).toBe(e.nebenkostenGesamtEur);
  });

  it('rechnet den Einstandspreis je Stueck aus und weist die Rundungsdifferenz aus', () => {
    const nk: Nebenkosten[] = [
      { bezeichnung: 'Fracht', betragEur: 10000, verteilmethode: 'wert' },
    ];
    const e = verteileNebenkosten(positionen, nk);

    for (const p of e.positionen) {
      const eingang = positionen.find((q) => q.id === p.chargeId);
      expect(eingang).toBeDefined();
      const menge = eingang!.menge;
      // Definition der Rundungsdifferenz: was der Stueckpreis mal Menge
      // gegenueber dem Positionswert nicht abbildet.
      expect(p.einstandGesamtEur - p.einstandspreisEur * menge).toBe(
        p.rundungsdifferenzEur,
      );
      expect(Math.abs(p.rundungsdifferenzEur)).toBeLessThan(menge);
      expect(Number.isInteger(p.einstandspreisEur)).toBe(true);
    }
  });

  it('laesst den Warenwert unveraendert, wenn es keine Nebenkosten gibt', () => {
    const e = verteileNebenkosten(positionen, []);
    expect(e.nebenkostenGesamtEur).toBe(0);
    expect(e.positionen.map((p) => p.nebenkostenEur)).toEqual([0, 0, 0]);
    expect(e.positionen[0]!.einstandspreisEur).toBe(90000);
  });

  it('ueberspringt Nebenkosten von null', () => {
    const e = verteileNebenkosten(positionen, [
      { bezeichnung: 'Rabatt', betragEur: 0, verteilmethode: 'wert' },
    ]);
    expect(e.positionen.map((p) => p.nebenkostenEur)).toEqual([0, 0, 0]);
  });
});

describe('verteileNebenkosten – Fremdwaehrung mit eingefrorenem Kurs (Regel 6)', () => {
  it('verteilt auf Basis der bereits in Euro umgerechneten Werte', () => {
    // Rechnung ueber 1.200,00 USD, Kurs 1 USD = 0,9150 EUR.
    const kurs = 0.915;
    const wertA = fremdZuEur(80000, kurs); // 800,00 USD -> 732,00 EUR
    const wertB = fremdZuEur(40000, kurs); // 400,00 USD -> 366,00 EUR
    expect(wertA).toBe(73200);
    expect(wertB).toBe(36600);

    // Fracht wird in USD berechnet und ebenfalls beim Wareneingang eingefroren.
    const frachtEur = fremdZuEur(15000, kurs); // 150,00 USD -> 137,25 EUR
    expect(frachtEur).toBe(13725);

    const e = verteileNebenkosten(
      [pos('a', 10, wertA), pos('b', 5, wertB)],
      [{ bezeichnung: 'Fracht', betragEur: frachtEur, verteilmethode: 'wert' }],
    );

    // Werte stehen 2:1, also 9.150 zu 4.575 Cent.
    expect(e.positionen.map((p) => p.nebenkostenEur)).toEqual([9150, 4575]);
    expect(e.positionen[0]!.einstandspreisEur).toBe(8235); // 82,35 EUR
    expect(e.positionen[1]!.einstandspreisEur).toBe(8235);
  });
});

describe('verteileNebenkosten – Rundung auf Cent (Regel 10)', () => {
  it('vergibt den Rundungsrest deterministisch, ohne Cent zu erfinden', () => {
    // 100,00 EUR Fracht auf drei gleich wertige Positionen: 33,33 dreimal
    // liesse einen Cent uebrig.
    const e = verteileNebenkosten(
      [pos('a', 1, 1000), pos('b', 1, 1000), pos('c', 1, 1000)],
      [{ bezeichnung: 'Fracht', betragEur: 10000, verteilmethode: 'wert' }],
    );
    const anteile = e.positionen.map((p) => p.nebenkostenEur);
    expect(anteile.reduce((a, b) => a + b, 0)).toBe(10000);
    expect(anteile).toEqual([3334, 3333, 3333]);
  });

  it('rundet den Stueckpreis erst am Ende', () => {
    // 10,01 EUR auf 3 Stueck: 333,66 Cent je Stueck, gerundet 334.
    const e = verteileNebenkosten(
      [pos('a', 3, 1001)],
      [],
    );
    expect(e.positionen[0]!.einstandspreisEur).toBe(334);
    expect(e.positionen[0]!.rundungsdifferenzEur).toBe(1001 - 334 * 3);
  });
});

describe('einstandspreisJeStueck', () => {
  it('rechnet den Einzelfall ueber denselben Weg', () => {
    expect(einstandspreisJeStueck(pos('a', 4, 10000))).toBe(2500);
    expect(
      einstandspreisJeStueck(pos('a', 4, 10000), [
        { bezeichnung: 'Fracht', betragEur: 2000, verteilmethode: 'wert' },
      ]),
    ).toBe(3000);
  });
});

describe('verteileNebenkosten – Fehlerfaelle', () => {
  it('lehnt eine Sendung ohne Positionen ab', () => {
    expect(() => verteileNebenkosten([], [])).toThrow(VerteilungsFehler);
  });

  it('lehnt ungueltige Mengen ab', () => {
    expect(() => verteileNebenkosten([pos('a', 0, 100)], [])).toThrow(/Menge/);
    expect(() => verteileNebenkosten([pos('a', -1, 100)], [])).toThrow(/Menge/);
    expect(() => verteileNebenkosten([pos('a', 1.5, 100)], [])).toThrow(/Menge/);
  });

  it('lehnt ungueltige Warenwerte ab', () => {
    expect(() => verteileNebenkosten([pos('a', 1, -100)], [])).toThrow(
      /nicht negativ/,
    );
    expect(() => verteileNebenkosten([pos('a', 1, 10.5)], [])).toThrow(
      VerteilungsFehler,
    );
  });

  it('lehnt Nebenkosten ab, die keine Cent-Betraege sind', () => {
    expect(() =>
      verteileNebenkosten([pos('a', 1, 100)], [
        { bezeichnung: 'Fracht', betragEur: 1.5, verteilmethode: 'wert' },
      ]),
    ).toThrow(/Fracht/);
  });
});
