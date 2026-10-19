import { describe, expect, it } from 'vitest';
import {
  FifoError,
  stockValue,
  returnToBatches,
  averageLandedCost,
  allocateIssue,
  sortFifo,
  availableQuantity,
} from '../src/fifo.js';
import type { Batch } from '../src/types.js';

const batch = (
  id: string,
  datum: string,
  quantityReceived: number,
  quantityRemaining: number,
  landedCostEur: number,
): Batch => ({
  id,
  variantId: 'v1',
  receivedAt: new Date(datum),
  quantityReceived,
  quantityRemaining,
  landedCostEur,
});

// Three batches of one variant with rising landed cost.
const threeBatches = (): Batch[] => [
  batch('c1', '2026-01-10', 10, 10, 1200), // 12.00 EUR
  batch('c2', '2026-02-15', 20, 20, 1350), // 13.50 EUR
  batch('c3', '2026-03-20', 30, 30, 1500), // 15.00 EUR
];

describe('sortFifo', () => {
  it('sortiert nach Wareneingang, aeltester zuerst', () => {
    const unsortiert = [
      batch('c3', '2026-03-20', 1, 1, 100),
      batch('c1', '2026-01-10', 1, 1, 100),
      batch('c2', '2026-02-15', 1, 1, 100),
    ];
    expect(sortFifo(unsortiert).map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('entscheidet bei gleichem Datum stabil ueber die id', () => {
    const gleich = [
      batch('b', '2026-01-10', 1, 1, 100),
      batch('a', '2026-01-10', 1, 1, 100),
      batch('c', '2026-01-10', 1, 1, 100),
    ];
    expect(sortFifo(gleich).map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('veraendert die Eingangsliste nicht', () => {
    const original = threeBatches().reverse();
    const kopie = [...original];
    sortFifo(original);
    expect(original).toEqual(kopie);
  });
});

describe('allocateIssue – Abgang ueber drei Chargen mit Rest (Regel 9)', () => {
  it('verbraucht die aelteste Batch zuerst und verteilt ueber drei Chargen', () => {
    const chargen = threeBatches(); // 60 units
    const e = allocateIssue(chargen, 45);

    expect(e.allocations).toEqual([
      { batchId: 'c1', quantity: 10, landedCostEur: 1200 },
      { batchId: 'c2', quantity: 20, landedCostEur: 1350 },
      { batchId: 'c3', quantity: 15, landedCostEur: 1500 },
    ]);
    expect(e.uncoveredQuantity).toBe(0);

    // 10*12.00 + 20*13.50 + 15*15.00 = 615.00 EUR
    expect(e.costOfGoodsSoldEur).toBe(61500);

    expect(e.batchesAfter.map((c) => [c.id, c.quantityRemaining])).toEqual([
      ['c1', 0],
      ['c2', 0],
      ['c3', 15],
    ]);
    expect(availableQuantity(e.batchesAfter)).toBe(15);
  });

  it('veraendert die uebergebenen Chargen nicht', () => {
    const chargen = threeBatches();
    const vorher = chargen.map((c) => c.quantityRemaining);
    allocateIssue(chargen, 45);
    expect(chargen.map((c) => c.quantityRemaining)).toEqual(vorher);
  });

  it('bleibt innerhalb einer Batch, wenn sie ausreicht', () => {
    const e = allocateIssue(threeBatches(), 4);
    expect(e.allocations).toEqual([
      { batchId: 'c1', quantity: 4, landedCostEur: 1200 },
    ]);
    expect(e.costOfGoodsSoldEur).toBe(4800);
  });

  it('ueberspringt leere Chargen', () => {
    const chargen = [
      batch('leer', '2026-01-01', 5, 0, 1000),
      batch('voll', '2026-02-01', 5, 5, 2000),
    ];
    const e = allocateIssue(chargen, 3);
    expect(e.allocations.map((z) => z.batchId)).toEqual(['voll']);
    expect(e.batchesAfter.find((c) => c.id === 'leer')!.quantityRemaining).toBe(0);
  });

  it('weist Fehlmengen aus, statt zu werfen', () => {
    // Whether stock may go negative is decided by the caller, not the engine.
    const e = allocateIssue(threeBatches(), 100);
    expect(e.uncoveredQuantity).toBe(40);
    expect(availableQuantity(e.batchesAfter)).toBe(0);
    expect(e.costOfGoodsSoldEur).toBe(10 * 1200 + 20 * 1350 + 30 * 1500);
  });

  it('meldet die volle Menge als ungedeckt, wenn nichts vorhanden ist', () => {
    const e = allocateIssue([], 5);
    expect(e.allocations).toEqual([]);
    expect(e.uncoveredQuantity).toBe(5);
    expect(e.costOfGoodsSoldEur).toBe(0);
  });

  it('haelt bei erschoepftem Bedarf spaetere Chargen unberuehrt', () => {
    // Covers the loop continuing after the issue is fully allocated.
    const e = allocateIssue(threeBatches(), 5);
    expect(e.batchesAfter.map((c) => c.quantityRemaining)).toEqual([5, 20, 30]);
  });

  it('lehnt ungueltige Abgangsmengen ab', () => {
    expect(() => allocateIssue(threeBatches(), 0)).toThrow(FifoError);
    expect(() => allocateIssue(threeBatches(), -1)).toThrow(FifoError);
    expect(() => allocateIssue(threeBatches(), 1.5)).toThrow(FifoError);
  });
});

describe('returnToBatches – Retoure und Storno', () => {
  it('bucht in genau die Chargen zurueck, aus denen die Ware kam', () => {
    const chargen = threeBatches();
    const abgang = allocateIssue(chargen, 45);
    const zurueck = returnToBatches(abgang.batchesAfter, abgang.allocations);

    // A full reversal restores the initial state.
    expect(zurueck.map((c) => [c.id, c.quantityRemaining])).toEqual([
      ['c1', 10],
      ['c2', 20],
      ['c3', 30],
    ]);
  });

  it('bucht eine Teilretoure in die richtige Batch', () => {
    const chargen = threeBatches();
    const abgang = allocateIssue(chargen, 45);
    // Only 5 units from the most expensive batch come back.
    const zurueck = returnToBatches(abgang.batchesAfter, [
      { batchId: 'c3', quantity: 5, landedCostEur: 1500 },
    ]);
    expect(zurueck.find((c) => c.id === 'c3')!.quantityRemaining).toBe(20);
    expect(zurueck.find((c) => c.id === 'c1')!.quantityRemaining).toBe(0);
  });

  it('lehnt eine Rueckbuchung ueber die Eingangsmenge hinaus ab', () => {
    const chargen = threeBatches();
    expect(() =>
      returnToBatches(chargen, [
        { batchId: 'c1', quantity: 1, landedCostEur: 1200 },
      ]),
    ).toThrow(/ueberschreitet die Eingangsmenge/);
  });

  it('lehnt unbekannte Chargen ab', () => {
    expect(() =>
      returnToBatches(threeBatches(), [
        { batchId: 'gibtsnicht', quantity: 1, landedCostEur: 100 },
      ]),
    ).toThrow(/nicht bekannt/);
  });

  it('lehnt ungueltige Mengen ab', () => {
    expect(() =>
      returnToBatches(threeBatches(), [
        { batchId: 'c1', quantity: 0, landedCostEur: 100 },
      ]),
    ).toThrow(FifoError);
    expect(() =>
      returnToBatches(threeBatches(), [
        { batchId: 'c1', quantity: 1.5, landedCostEur: 100 },
      ]),
    ).toThrow(FifoError);
  });
});

describe('stockValue und averageLandedCost', () => {
  it('bewertet den Restbestand zu Einstandspreisen', () => {
    // 10*12.00 + 20*13.50 + 30*15.00 = 840.00 EUR
    expect(stockValue(threeBatches())).toBe(84000);
    expect(stockValue([])).toBe(0);
  });

  it('bildet den gewichteten Durchschnitt', () => {
    // 840.00 EUR / 60 units = 14.00 EUR
    expect(averageLandedCost(threeBatches())).toBe(1400);
  });

  it('gibt ohne Restbestand null zurueck', () => {
    expect(averageLandedCost([])).toBe(0);
    expect(
      averageLandedCost([batch('c', '2026-01-01', 5, 0, 1000)]),
    ).toBe(0);
  });
});
