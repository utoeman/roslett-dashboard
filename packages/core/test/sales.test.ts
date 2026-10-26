import { describe, expect, it } from 'vitest';
import { SalesError, flatFee, orderTotalGross, saleMargins, shippingRevenueFor, type SaleLine } from '../src/sales';

const line = (id: string, quantity: number, unitPriceGross: number, extra: Partial<SaleLine> = {}): SaleLine => ({
  id,
  quantity,
  unitPriceGross,
  vatRate: 0.19,
  costOfGoodsEur: 0,
  unitCostItemsEur: 0,
  ...extra,
});

const noExtras = { shippingRevenueGross: 0, postageCost: 0, discountGross: 0, feesEur: 0 };

describe('shippingRevenueFor', () => {
  const channel = { shippingPriceGross: 490, freeShippingFrom: 5000 };

  it('berechnet den Versandpreis unter der Grenze', () => {
    expect(shippingRevenueFor(channel, 4999)).toBe(490);
  });

  it('ist versandkostenfrei ab der Grenze', () => {
    expect(shippingRevenueFor(channel, 5000)).toBe(0);
  });

  it('berechnet ohne Grenze immer den Versandpreis', () => {
    expect(shippingRevenueFor({ shippingPriceGross: 490, freeShippingFrom: null }, 100_000)).toBe(490);
  });
});

describe('orderTotalGross', () => {
  it('ist Warenwert minus Rabatt plus Versanderlös', () => {
    expect(orderTotalGross([line('a', 2, 1500), line('b', 1, 1000)], 500, 490)).toBe(3990);
  });
});

describe('flatFee', () => {
  it('rechnet Prozent auf die Bestellsumme plus Fixbetrag', () => {
    expect(flatFee({ feePercent: 0.065, feeFixed: 30 }, 4480)).toBe(321);
  });

  it('ist ohne Bestellsumme nur der Fixbetrag', () => {
    expect(flatFee({ feePercent: 0.065, feeFixed: 30 }, 0)).toBe(30);
  });
});

describe('saleMargins', () => {
  it('rechnet das Beispiel aus den Screens (Etsy #3291) nach', () => {
    const result = saleMargins({
      shippingRevenueGross: 490,
      postageCost: 495,
      discountGross: 0,
      feesEur: 449,
      lines: [line('a', 1, 3990, { costOfGoodsEur: 948 })],
    });
    const [a] = result.lines;
    expect(a).toMatchObject({
      goodsGross: 3990,
      revenueNetEur: 3353,
      costOfGoodsEur: 948,
      feesEur: 449,
      postageEur: 495,
      shippingRevenueNetEur: 412,
      discountNetEur: 0,
      contributionMarginEur: 1873,
    });
    expect(a?.margin).toBeCloseTo(0.5586, 4);
    expect(result.totals.contributionMarginEur).toBe(1873);
  });

  it('verteilt Rabatt, Versand, Porto und Gebühren nach Warenwert', () => {
    const result = saleMargins({
      shippingRevenueGross: 400,
      postageCost: 400,
      discountGross: 400,
      feesEur: 400,
      lines: [line('a', 1, 3000), line('b', 1, 1000)],
    });
    expect(result.lines.map((l) => l.postageEur)).toEqual([300, 100]);
    expect(result.lines.map((l) => l.feesEur)).toEqual([300, 100]);
    // 300 / 1.19 = 252.1 → 252; 100 / 1.19 = 84.03 → 84
    expect(result.lines.map((l) => l.discountNetEur)).toEqual([252, 84]);
    expect(result.lines.map((l) => l.shippingRevenueNetEur)).toEqual([252, 84]);
  });

  it('verliert beim Verteilen keinen Cent', () => {
    const result = saleMargins({
      ...noExtras,
      postageCost: 100,
      lines: [line('a', 1, 1000), line('b', 1, 1000), line('c', 1, 1000)],
    });
    expect(result.lines.map((l) => l.postageEur)).toEqual([34, 33, 33]);
    expect(result.totals.postageEur).toBe(100);
  });

  it('rechnet Netto mit dem Satz der Position und Stückkosten je Stück', () => {
    const result = saleMargins({
      ...noExtras,
      lines: [line('a', 3, 1070, { vatRate: 0.07, costOfGoodsEur: 1500, unitCostItemsEur: 40 })],
    });
    const [a] = result.lines;
    // 3 × 10,70 = 32,10 brutto, / 1,07 = 30,00 netto
    expect(a?.revenueNetEur).toBe(3000);
    expect(a?.costItemsEur).toBe(120);
    expect(a?.contributionMarginEur).toBe(3000 - 1500 - 120);
    expect(a?.margin).toBeCloseTo(0.46, 4);
  });

  it('summiert die Positionen und rechnet die Gesamtmarge auf VK netto', () => {
    const result = saleMargins({
      ...noExtras,
      lines: [line('a', 1, 1190, { costOfGoodsEur: 500 }), line('b', 1, 2380, { costOfGoodsEur: 1000 })],
    });
    expect(result.totals).toMatchObject({
      goodsGross: 3570,
      revenueNetEur: 3000,
      costOfGoodsEur: 1500,
      contributionMarginEur: 1500,
    });
    expect(result.totals.margin).toBe(0.5);
  });

  it('gibt bei VK netto 0 eine Marge von 0 zurück', () => {
    const result = saleMargins({ ...noExtras, lines: [line('a', 1, 0, { costOfGoodsEur: 300 })] });
    expect(result.lines[0]?.contributionMarginEur).toBe(-300);
    expect(result.lines[0]?.margin).toBe(0);
    expect(result.totals.margin).toBe(0);
  });

  it('lehnt ungültige Eingaben ab', () => {
    expect(() => saleMargins({ ...noExtras, lines: [] })).toThrow(SalesError);
    expect(() => saleMargins({ ...noExtras, lines: [line('a', 0, 1000)] })).toThrow(SalesError);
    expect(() => saleMargins({ ...noExtras, lines: [line('a', 1, 1000, { vatRate: -0.1 })] })).toThrow(SalesError);
    expect(() => saleMargins({ ...noExtras, lines: [line('a', 1, 10.5)] })).toThrow();
  });
});
