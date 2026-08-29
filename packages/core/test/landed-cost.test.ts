import { describe, expect, it } from 'vitest';
import {
  DistributionError,
  landedCostPerUnit,
  distributeAdditionalCosts,
} from '../src/landed-cost.js';
import { foreignToEur } from '../src/money.js';
import type { BatchItem, AdditionalCost } from '../src/types.js';

const item = (
  id: string,
  quantity: number,
  goodsValueEur: number,
): BatchItem => ({ id, variantId: `v-${id}`, quantity, goodsValueEur });

describe('distributeAdditionalCosts – drei Artikel mit stark unterschiedlichen Werten', () => {
  // Eine Sendung mit einem teuren, einem mittleren und einem billigen Artikel.
  // Genau hier zeigt sich, warum nach Wert und nicht nach Stueckzahl verteilt
  // wird: die 200 Billigteile wuerden sonst fast die gesamte Fracht tragen.
  const items = [
    item('teuer', 2, 180000), // 900,00 EUR je Stueck
    item('mittel', 10, 45000), //  45,00 EUR je Stueck
    item('billig', 200, 20000), //   1,00 EUR je Stueck
  ];
  const warenwertGesamt = 180000 + 45000 + 20000; // 2.450,00 EUR

  it('verteilt nach Warenwert und verliert keinen Cent', () => {
    const fracht: AdditionalCost[] = [
      { label: 'Seefracht', amountEur: 49000, distributionMethod: 'value' },
    ];
    const e = distributeAdditionalCosts(items, fracht);

    expect(e.goodsValueTotalEur).toBe(warenwertGesamt);
    expect(e.additionalCostsTotalEur).toBe(49000);

    const verteilt = e.items.map((p) => p.additionalCostsEur);
    expect(verteilt.reduce((a, b) => a + b, 0)).toBe(49000);

    // 490,00 EUR auf 2.450,00 EUR Warenwert sind genau 20 Prozent.
    expect(verteilt).toEqual([36000, 9000, 4000]);
  });

  it('verteilt nach Stueckzahl, wenn die Position das vorsieht', () => {
    const verpackung: AdditionalCost[] = [
      { label: 'Verpackung', amountEur: 21200, distributionMethod: 'quantity' },
    ];
    const e = distributeAdditionalCosts(items, verpackung);
    const verteilt = e.items.map((p) => p.additionalCostsEur);

    // 212 Stueck, 212,00 EUR – exakt 1,00 EUR je Stueck.
    expect(verteilt).toEqual([200, 1000, 20000]);
    expect(verteilt.reduce((a, b) => a + b, 0)).toBe(21200);
  });

  it('mischt beide Methoden in einer Sendung', () => {
    const nk: AdditionalCost[] = [
      { label: 'Seefracht', amountEur: 49000, distributionMethod: 'value' },
      { label: 'Zoll', amountEur: 12250, distributionMethod: 'value' },
      { label: 'Verpackung', amountEur: 21200, distributionMethod: 'quantity' },
    ];
    const e = distributeAdditionalCosts(items, nk);
    const summeVerteilt = e.items.reduce((s, p) => s + p.additionalCostsEur, 0);

    expect(e.additionalCostsTotalEur).toBe(49000 + 12250 + 21200);
    expect(summeVerteilt).toBe(e.additionalCostsTotalEur);
  });

  it('rechnet den Einstandspreis je Stueck aus und weist die Rundungsdifferenz aus', () => {
    const nk: AdditionalCost[] = [
      { label: 'Fracht', amountEur: 10000, distributionMethod: 'value' },
    ];
    const e = distributeAdditionalCosts(items, nk);

    for (const p of e.items) {
      const eingang = items.find((q) => q.id === p.batchId);
      expect(eingang).toBeDefined();
      const quantity = eingang!.quantity;
      // Definition der Rundungsdifferenz: was der Stueckpreis mal Menge
      // gegenueber dem Positionswert nicht abbildet.
      expect(p.totalLandedCostEur - p.landedCostEur * quantity).toBe(
        p.roundingDifferenceEur,
      );
      expect(Math.abs(p.roundingDifferenceEur)).toBeLessThan(quantity);
      expect(Number.isInteger(p.landedCostEur)).toBe(true);
    }
  });

  it('laesst den Warenwert unveraendert, wenn es keine AdditionalCost gibt', () => {
    const e = distributeAdditionalCosts(items, []);
    expect(e.additionalCostsTotalEur).toBe(0);
    expect(e.items.map((p) => p.additionalCostsEur)).toEqual([0, 0, 0]);
    expect(e.items[0]!.landedCostEur).toBe(90000);
  });

  it('ueberspringt AdditionalCost von null', () => {
    const e = distributeAdditionalCosts(items, [
      { label: 'Rabatt', amountEur: 0, distributionMethod: 'value' },
    ]);
    expect(e.items.map((p) => p.additionalCostsEur)).toEqual([0, 0, 0]);
  });
});

describe('distributeAdditionalCosts – Fremdwaehrung mit eingefrorenem Kurs (Regel 6)', () => {
  it('verteilt auf Basis der bereits in Euro umgerechneten Werte', () => {
    // Rechnung ueber 1.200,00 USD, Kurs 1 USD = 0,9150 EUR.
    const kurs = 0.915;
    const wertA = foreignToEur(80000, kurs); // 800,00 USD -> 732,00 EUR
    const wertB = foreignToEur(40000, kurs); // 400,00 USD -> 366,00 EUR
    expect(wertA).toBe(73200);
    expect(wertB).toBe(36600);

    // Fracht wird in USD berechnet und ebenfalls beim Wareneingang eingefroren.
    const frachtEur = foreignToEur(15000, kurs); // 150,00 USD -> 137,25 EUR
    expect(frachtEur).toBe(13725);

    const e = distributeAdditionalCosts(
      [item('a', 10, wertA), item('b', 5, wertB)],
      [{ label: 'Fracht', amountEur: frachtEur, distributionMethod: 'value' }],
    );

    // Werte stehen 2:1, also 9.150 zu 4.575 Cent.
    expect(e.items.map((p) => p.additionalCostsEur)).toEqual([9150, 4575]);
    expect(e.items[0]!.landedCostEur).toBe(8235); // 82,35 EUR
    expect(e.items[1]!.landedCostEur).toBe(8235);
  });
});

describe('distributeAdditionalCosts – Rundung auf Cent (Regel 10)', () => {
  it('vergibt den Rundungsrest deterministisch, ohne Cent zu erfinden', () => {
    // 100,00 EUR Fracht auf drei gleich wertige Positionen: 33,33 dreimal
    // liesse einen Cent uebrig.
    const e = distributeAdditionalCosts(
      [item('a', 1, 1000), item('b', 1, 1000), item('c', 1, 1000)],
      [{ label: 'Fracht', amountEur: 10000, distributionMethod: 'value' }],
    );
    const anteile = e.items.map((p) => p.additionalCostsEur);
    expect(anteile.reduce((a, b) => a + b, 0)).toBe(10000);
    expect(anteile).toEqual([3334, 3333, 3333]);
  });

  it('rundet den Stueckpreis erst am Ende', () => {
    // 10,01 EUR auf 3 Stueck: 333,66 Cent je Stueck, gerundet 334.
    const e = distributeAdditionalCosts(
      [item('a', 3, 1001)],
      [],
    );
    expect(e.items[0]!.landedCostEur).toBe(334);
    expect(e.items[0]!.roundingDifferenceEur).toBe(1001 - 334 * 3);
  });
});

describe('landedCostPerUnit', () => {
  it('rechnet den Einzelfall ueber denselben Weg', () => {
    expect(landedCostPerUnit(item('a', 4, 10000))).toBe(2500);
    expect(
      landedCostPerUnit(item('a', 4, 10000), [
        { label: 'Fracht', amountEur: 2000, distributionMethod: 'value' },
      ]),
    ).toBe(3000);
  });
});

describe('distributeAdditionalCosts – Fehlerfaelle', () => {
  it('lehnt eine Sendung ohne Positionen ab', () => {
    expect(() => distributeAdditionalCosts([], [])).toThrow(DistributionError);
  });

  it('lehnt ungueltige Mengen ab', () => {
    expect(() => distributeAdditionalCosts([item('a', 0, 100)], [])).toThrow(/Menge/);
    expect(() => distributeAdditionalCosts([item('a', -1, 100)], [])).toThrow(/Menge/);
    expect(() => distributeAdditionalCosts([item('a', 1.5, 100)], [])).toThrow(/Menge/);
  });

  it('lehnt ungueltige Warenwerte ab', () => {
    expect(() => distributeAdditionalCosts([item('a', 1, -100)], [])).toThrow(
      /nicht negativ/,
    );
    expect(() => distributeAdditionalCosts([item('a', 1, 10.5)], [])).toThrow(
      DistributionError,
    );
  });

  it('lehnt AdditionalCost ab, die keine Cent-Betraege sind', () => {
    expect(() =>
      distributeAdditionalCosts([item('a', 1, 100)], [
        { label: 'Fracht', amountEur: 1.5, distributionMethod: 'value' },
      ]),
    ).toThrow(/Fracht/);
  });
});
