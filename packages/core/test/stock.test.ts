import { describe, expect, it } from 'vitest';
import {
  StockError,
  convertToEur,
  deliveryState,
  planIssue,
  planShortfallResolution,
  planStocktake,
  receiptNumber,
} from '../src/stock';

const batch = (id: string, invoiceDate: string, remaining: number) => ({ id, invoiceDate, remaining });

// Older invoice first, regardless of list order.
const batches = [batch('b2', '2026-02-01', 20), batch('b1', '2026-01-10', 10), batch('b3', '2026-03-01', 30)];

describe('planIssue (FIFO)', () => {
  it('nimmt die älteste Charge zuerst und geht über mehrere Chargen', () => {
    expect(planIssue(batches, 25)).toEqual([
      { batchId: 'b1', quantity: -10 },
      { batchId: 'b2', quantity: -15 },
    ]);
  });

  it('bucht den Rest ohne Charge als Fehlmenge', () => {
    expect(planIssue([batch('b1', '2026-01-10', 2)], 5)).toEqual([
      { batchId: 'b1', quantity: -2 },
      { batchId: null, quantity: -3 },
    ]);
    expect(planIssue([], 1)).toEqual([{ batchId: null, quantity: -1 }]);
  });

  it('überspringt leere Chargen und sortiert bei gleichem Datum nach id', () => {
    const same = [batch('b', '2026-01-01', 5), batch('a', '2026-01-01', 5), batch('z', '2025-12-01', 0)];
    expect(planIssue(same, 6)).toEqual([
      { batchId: 'a', quantity: -5 },
      { batchId: 'b', quantity: -1 },
    ]);
  });

  it('verlangt eine positive ganze Menge', () => {
    expect(() => planIssue(batches, 0)).toThrow(StockError);
    expect(() => planIssue(batches, 1.5)).toThrow(StockError);
  });
});

describe('planStocktake', () => {
  it('bucht ein Plus auf die neueste Charge', () => {
    expect(planStocktake(batches, 2)).toEqual([{ batchId: 'b3', quantity: 2 }]);
  });

  it('nimmt auch eine leere neueste Charge für ein Plus', () => {
    expect(planStocktake([batch('b1', '2026-01-10', 4), batch('b9', '2026-05-01', 0)], 1)).toEqual([
      { batchId: 'b9', quantity: 1 },
    ]);
  });

  it('bucht ein Minus per FIFO', () => {
    expect(planStocktake(batches, -12)).toEqual([
      { batchId: 'b1', quantity: -10 },
      { batchId: 'b2', quantity: -2 },
    ]);
  });

  it('lehnt ein Plus ohne jede Charge ab und ergibt bei 0 nichts', () => {
    expect(() => planStocktake([], 1)).toThrow(/Wareneingang/);
    expect(planStocktake(batches, 0)).toEqual([]);
  });
});

describe('planShortfallResolution', () => {
  it('ordnet offene Fehlmengen den Chargen per FIFO zu', () => {
    const result = planShortfallResolution(
      [
        { allocationId: 's1', quantity: -3 },
        { allocationId: 's2', quantity: -2 },
      ],
      [batch('n1', '2026-04-01', 4)],
    );
    expect(result).toEqual([
      { allocationId: 's1', parts: [{ batchId: 'n1', quantity: -3 }], open: 0 },
      { allocationId: 's2', parts: [{ batchId: 'n1', quantity: -1 }], open: -1 },
    ]);
  });

  it('verteilt eine Fehlmenge auf mehrere Chargen', () => {
    const result = planShortfallResolution(
      [{ allocationId: 's1', quantity: -5 }],
      [batch('n2', '2026-05-01', 10), batch('n1', '2026-04-01', 2)],
    );
    expect(result).toEqual([
      {
        allocationId: 's1',
        parts: [
          { batchId: 'n1', quantity: -2 },
          { batchId: 'n2', quantity: -3 },
        ],
        open: 0,
      },
    ]);
  });

  it('lässt Fehlmengen offen, wenn kein Bestand da ist', () => {
    expect(planShortfallResolution([{ allocationId: 's1', quantity: -2 }], [])).toEqual([
      { allocationId: 's1', parts: [], open: -2 },
    ]);
  });
});

describe('deliveryState', () => {
  it('leitet den Lieferstatus ab', () => {
    expect(deliveryState(30, 0)).toBe('open');
    expect(deliveryState(30, 24)).toBe('partial');
    expect(deliveryState(30, 30)).toBe('complete');
    expect(deliveryState(30, 31)).toBe('complete');
  });
});

describe('receiptNumber', () => {
  it('bildet WE-Jahr-laufende Nummer', () => {
    expect(receiptNumber(2026, 14)).toBe('WE-2026-014');
    expect(receiptNumber(2026, 1234)).toBe('WE-2026-1234');
  });
});

describe('convertToEur (EZB-Kurs: 1 EUR = x Fremdwährung)', () => {
  it('teilt durch den Kurs und rundet auf Cent', () => {
    // 380,00 TRY at 47.85 TRY per EUR = 7.94 EUR
    expect(convertToEur(38000, 47.85)).toBe(794);
    expect(convertToEur(12345, 1)).toBe(12345);
  });

  it('lehnt Kurse von null oder darunter ab', () => {
    expect(() => convertToEur(100, 0)).toThrow();
    expect(() => convertToEur(100, -1)).toThrow();
  });
});
