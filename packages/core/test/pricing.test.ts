import { describe, expect, it } from 'vitest';
import {
  PricingError,
  calculateChannelPrice,
  calculateMargin,
  calculateTotalCost,
  calculateSalesPrice,
  minimumMargin,
  costItemsForVariant,
} from '../src/pricing.js';
import { MoneyError } from '../src/money.js';
import type { Channel, CostItem } from '../src/types.js';

const ci = (
  label: string,
  kind: 'fix' | 'percent',
  value: number,
  optionen: Partial<CostItem> = {},
): CostItem => ({
  id: label,
  variantId: null,
  label,
  kind,
  value,
  inputTaxDeductible: false,
  active: true,
  distributionMethod: 'value',
  ...optionen,
});

const channel = (over: Partial<Channel> = {}): Channel => ({
  id: 'k1',
  name: 'Etsy',
  feePercent: 0.065,
  feeFixed: 20,
  pricingRule: 'same_margin',
  active: true,
  ...over,
});

describe('costItemsForVariant', () => {
  it('nimmt globale und variantenspezifische aktive Positionen', () => {
    const alle = [
      ci('global', 'fix', 100),
      ci('eigene', 'fix', 200, { variantId: 'v1' }),
      ci('fremde', 'fix', 300, { variantId: 'v2' }),
      ci('inaktiv', 'fix', 400, { active: false }),
    ];
    expect(costItemsForVariant(alle, 'v1').map((p) => p.label)).toEqual([
      'global',
      'eigene',
    ]);
  });
});

describe('calculateTotalCost – gemischte Fix- und Prozentkosten', () => {
  it('summiert Fixbetraege und Prozentanteile auf den Einstandspreis', () => {
    // Landed cost 20.00 EUR
    const e = calculateTotalCost(2000, [
      ci('Verpackung', 'fix', 85), //        0.85 EUR
      ci('Handling', 'percent', 0.05), //    5 % of 20.00 = 1.00 EUR
      ci('Lagerkosten', 'fix', 40), //       0.40 EUR
      ci('Ausschussquote', 'percent', 0.02), // 2 % of 20.00 = 0.40 EUR
    ]);

    expect(e.landedCostEur).toBe(2000);
    expect(e.rows.map((z) => z.amountEur)).toEqual([85, 100, 40, 40]);
    // 20.00 + 0.85 + 1.00 + 0.40 + 0.40 = 22.65 EUR
    expect(e.totalCostEur).toBe(2265);
    expect(e.inputTaxEur).toBe(0);
  });

  it('rundet erst am Ende, nicht je Position (Regel 10)', () => {
    // Rounding each 3.333 % share first would give 1100; summing unrounded gives 1101.
    const e = calculateTotalCost(1001, [
      ci('a', 'percent', 0.03333),
      ci('b', 'percent', 0.03333),
      ci('c', 'percent', 0.03333),
    ]);
    expect(e.totalCostEur).toBe(1101);
  });

  it('ueberspringt inaktive Positionen', () => {
    const e = calculateTotalCost(1000, [
      ci('active', 'fix', 100),
      ci('inaktiv', 'fix', 500, { active: false }),
    ]);
    expect(e.totalCostEur).toBe(1100);
    expect(e.rows).toHaveLength(1);
  });

  it('kommt ohne Positionen aus', () => {
    const e = calculateTotalCost(1000, []);
    expect(e.totalCostEur).toBe(1000);
    expect(e.rows).toEqual([]);
  });

  it('lehnt ungueltige Einstandspreise und Fixbetraege ab', () => {
    expect(() => calculateTotalCost(10.5, [])).toThrow(MoneyError);
    expect(() => calculateTotalCost(1000, [ci('krumm', 'fix', 1.5)])).toThrow(
      /krumm/,
    );
  });
});

describe('calculateTotalCost – vorsteuerabzugsfaehige Position (Regel 3)', () => {
  it('haelt Einfuhrumsatzsteuer aus den Selbstkosten heraus, Zoll aber nicht', () => {
    // Duty (4.7 %) counts towards cost; import VAT (19 %) is deductible and does not.
    const e = calculateTotalCost(10000, [
      ci('Zoll', 'percent', 0.047),
      ci('Einfuhrumsatzsteuer', 'percent', 0.19, {
        inputTaxDeductible: true,
      }),
    ]);

    // 100.00 + 4.70 = 104.70 EUR; the 19.00 EUR import VAT stays out.
    expect(e.totalCostEur).toBe(10470);
    expect(e.inputTaxEur).toBe(1900);

    expect(e.rows).toEqual([
      { label: 'Zoll', amountEur: 470, excluded: false },
      { label: 'Einfuhrumsatzsteuer', amountEur: 1900, excluded: true },
    ]);
  });

  it('behandelt auch fixe Positionen als abzugsfaehig, wenn markiert', () => {
    const e = calculateTotalCost(5000, [
      ci('EUSt fix', 'fix', 950, { inputTaxDeductible: true }),
      ci('Zollabfertigung', 'fix', 1500),
    ]);
    expect(e.totalCostEur).toBe(6500);
    expect(e.inputTaxEur).toBe(950);
  });
});

describe('calculateMargin – Marge und Aufschlag sind nicht dasselbe (Regel 4)', () => {
  it('unterscheidet die beiden Kennzahlen sauber', () => {
    // Cost 40.00 EUR, price 100.00 EUR.
    const e = calculateMargin(10000, 4000);
    expect(e.contributionMarginEur).toBe(6000);
    expect(e.margin).toBeCloseTo(0.6, 10); // 60 % of the price
    expect(e.markup).toBeCloseTo(1.5, 10); // 150 % on cost
    expect(e.margin).not.toBeCloseTo(e.markup, 5);
  });

  it('erkennt ein Verlustgeschaeft an negativen Kennzahlen', () => {
    const e = calculateMargin(5000, 8000);
    expect(e.contributionMarginEur).toBe(-3000);
    expect(e.margin).toBeCloseTo(-0.6, 10);
    expect(e.markup).toBeCloseTo(-0.375, 10);
  });

  it('gibt bei Verkaufspreis oder Selbstkosten von null jeweils null zurueck', () => {
    expect(calculateMargin(0, 1000).margin).toBe(0);
    expect(calculateMargin(1000, 0).markup).toBe(0);
    expect(calculateMargin(1000, 0).margin).toBeCloseTo(1, 10);
  });

  it('lehnt Nicht-Cent-Werte ab', () => {
    expect(() => calculateMargin(1.5, 100)).toThrow(MoneyError);
    expect(() => calculateMargin(100, 1.5)).toThrow(MoneyError);
  });
});

describe('calculateSalesPrice – Rueckwaertsrechnung (Regel 5)', () => {
  it('rechnet ohne Gebuehren aus der Zielmarge zurueck', () => {
    // Cost 40.00 EUR at 60 % margin: 40 / 0.4 = 100.00 EUR.
    const vk = calculateSalesPrice({ totalCostEur: 4000, targetMargin: 0.6 });
    expect(vk).toBe(10000);
    expect(calculateMargin(vk, 4000).margin).toBeCloseTo(0.6, 10);
  });

  it('bezieht prozentuale Gebuehren auf den gesuchten Verkaufspreis', () => {
    // (40.00 + 0.20) / (1 - 0.40 - 0.065) = 75.14 EUR
    const vk = calculateSalesPrice({
      totalCostEur: 4000,
      targetMargin: 0.4,
      feePercent: 0.065,
      feeFixedEur: 20,
    });
    expect(vk).toBe(7514);

    // Cross-check: after fees the target margin remains.
    const gebuehren = Math.round(vk * 0.065 + 20);
    const db = vk - 4000 - gebuehren;
    expect(db / vk).toBeCloseTo(0.4, 3);
  });

  it('liegt hoeher als der naive Aufschlag der Gebuehr auf die Selbstkosten', () => {
    const richtig = calculateSalesPrice({
      totalCostEur: 4000,
      targetMargin: 0.4,
      feePercent: 0.2,
    });
    const naiv = Math.round((4000 * 1.2) / (1 - 0.4));
    expect(richtig).toBeGreaterThan(naiv);
  });

  it('erlaubt eine Zielmarge von null', () => {
    expect(calculateSalesPrice({ totalCostEur: 4000, targetMargin: 0 })).toBe(
      4000,
    );
  });

  it('erlaubt eine negative Zielmarge als bewussten Verlustverkauf', () => {
    // Selling below cost: the denominator stays positive.
    expect(
      calculateSalesPrice({ totalCostEur: 4000, targetMargin: -0.25 }),
    ).toBe(3200);
  });

  it('wirft bei rechnerisch unmoeglicher Zielmarge', () => {
    // 70 % margin + 35 % fees = 105 %: negative denominator.
    expect(() =>
      calculateSalesPrice({
        totalCostEur: 4000,
        targetMargin: 0.7,
        feePercent: 0.35,
      }),
    ).toThrow(PricingError);

    expect(() =>
      calculateSalesPrice({
        totalCostEur: 4000,
        targetMargin: 0.7,
        feePercent: 0.35,
      }),
    ).toThrow(/105,0\s%.*nichts\s+fuer die Selbstkosten uebrig/s);
  });

  it('wirft, wenn Marge und Gebuehren exakt 100 Prozent ergeben', () => {
    expect(() =>
      calculateSalesPrice({
        totalCostEur: 4000,
        targetMargin: 0.9,
        feePercent: 0.1,
      }),
    ).toThrow(PricingError);
  });

  it('wirft bei einer Zielmarge von 100 Prozent oder mehr', () => {
    expect(() =>
      calculateSalesPrice({ totalCostEur: 4000, targetMargin: 1 }),
    ).toThrow(/unter 100 %/);
    expect(() =>
      calculateSalesPrice({ totalCostEur: 4000, targetMargin: 1.5 }),
    ).toThrow(/unter 100 %/);
  });

  it('lehnt ungueltige Parameter ab', () => {
    expect(() =>
      calculateSalesPrice({ totalCostEur: 4000, targetMargin: Number.NaN }),
    ).toThrow(PricingError);
    expect(() =>
      calculateSalesPrice({
        totalCostEur: 4000,
        targetMargin: 0.3,
        feePercent: -0.1,
      }),
    ).toThrow(PricingError);
    expect(() =>
      calculateSalesPrice({ totalCostEur: 1.5, targetMargin: 0.3 }),
    ).toThrow(MoneyError);
    expect(() =>
      calculateSalesPrice({
        totalCostEur: 4000,
        targetMargin: 0.3,
        feeFixedEur: 1.5,
      }),
    ).toThrow(MoneyError);
  });
});

describe('calculateChannelPrice', () => {
  it('rechnet bei gleicher Marge den Preis zurueck', () => {
    const e = calculateChannelPrice({
      channel: channel(),
      totalCostEur: 4000,
      targetMargin: 0.4,
    });
    expect(e.salesPriceNetEur).toBe(7514);
    expect(e.feesEur).toBe(Math.round(7514 * 0.065) + 20);
    expect(e.margin).toBeCloseTo(0.4, 3);
    expect(e.channelName).toBe('Etsy');
  });

  it('nimmt bei fester Preisregel den vorgegebenen Preis', () => {
    const e = calculateChannelPrice({
      channel: channel({ pricingRule: 'fixed', name: 'Ladenverkauf' }),
      totalCostEur: 4000,
      targetMargin: 0.4,
      fixedPriceEur: 6000,
    });
    expect(e.salesPriceNetEur).toBe(6000);
    // 6.5 % of 60.00 = 3.90 EUR, plus 0.20 EUR fixed.
    expect(e.feesEur).toBe(410);
    expect(e.contributionMarginEur).toBe(6000 - 4000 - 410);
    // Actual margin falls below target; that must be visible.
    expect(e.margin).toBeLessThan(0.4);
  });

  it('weist Marge und Aufschlag getrennt aus', () => {
    const e = calculateChannelPrice({
      channel: channel({ feePercent: 0, feeFixed: 0, pricingRule: 'fixed' }),
      totalCostEur: 4000,
      targetMargin: 0,
      fixedPriceEur: 10000,
    });
    expect(e.margin).toBeCloseTo(0.6, 10);
    expect(e.markup).toBeCloseTo(1.5, 10);
  });

  it('wirft, wenn bei fester Preisregel der Preis fehlt', () => {
    expect(() =>
      calculateChannelPrice({
        channel: channel({ pricingRule: 'fixed' }),
        totalCostEur: 4000,
        targetMargin: 0.4,
      }),
    ).toThrow(/kein Festpreis/);
  });

  it('gibt bei einem Festpreis von null neutrale Kennzahlen zurueck', () => {
    const e = calculateChannelPrice({
      channel: channel({ pricingRule: 'fixed' }),
      totalCostEur: 0,
      targetMargin: 0,
      fixedPriceEur: 0,
    });
    expect(e.margin).toBe(0);
    expect(e.markup).toBe(0);
  });

  it('lehnt ungueltige Selbstkosten und Festpreise ab', () => {
    expect(() =>
      calculateChannelPrice({ channel: channel(), totalCostEur: 1.5, targetMargin: 0.3 }),
    ).toThrow(MoneyError);
    expect(() =>
      calculateChannelPrice({
        channel: channel({ pricingRule: 'fixed' }),
        totalCostEur: 1000,
        targetMargin: 0.3,
        fixedPriceEur: 1.5,
      }),
    ).toThrow(MoneyError);
  });
});

describe('minimumMargin', () => {
  it('zeigt, was bei gegebenem Preis uebrig bleibt', () => {
    const m = minimumMargin(4000, { feePercent: 0.065, feeFixed: 20 }, 10000);
    // (100.00 - 40.00 - 6.50 - 0.20) / 100.00
    expect(m).toBeCloseTo(0.533, 3);
  });

  it('wird negativ, wenn der Preis nicht kostendeckend ist', () => {
    expect(
      minimumMargin(10000, { feePercent: 0.1, feeFixed: 0 }, 5000),
    ).toBeLessThan(0);
  });

  it('gibt bei Verkaufspreis null null zurueck', () => {
    expect(minimumMargin(1000, { feePercent: 0.1, feeFixed: 0 }, 0)).toBe(0);
  });

  it('lehnt Nicht-Cent-Werte ab', () => {
    expect(() =>
      minimumMargin(1.5, { feePercent: 0, feeFixed: 0 }, 1000),
    ).toThrow(MoneyError);
  });
});
