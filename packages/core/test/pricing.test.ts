import { describe, expect, it } from 'vitest';
import {
  PricingError,
  calculateMargin,
  calculateTotalCost,
  marginBeforeFees,
  costItemsForVariant,
  channelMarginGross,
  roundUpToNinety,
  suggestGrossPrice,
} from '../src/pricing.js';
import { MoneyError } from '../src/money.js';
import type { CostItem } from '../src/types.js';

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

describe('marginBeforeFees', () => {
  it('rechnet vom Bruttopreis netto und zieht den Einstand ab', () => {
    // 39.90 gross at 19 % = 33.53 net; 33.53 - 9.06 = 24.47
    const m = marginBeforeFees(3990, 0.19, 906);
    expect(m.salesPriceNetEur).toBe(3353);
    expect(m.contributionMarginEur).toBe(2447);
    expect(m.margin).toBeCloseTo(0.7298, 4);
  });

  it('wird negativ, wenn der Einstand ueber dem Nettopreis liegt', () => {
    expect(marginBeforeFees(1070, 0.07, 1200).contributionMarginEur).toBe(-200);
  });
});

const etsy = { feePercent: 0.105, feeFixed: 48 };
const shop = { feePercent: 0.021, feeFixed: 30 };

describe('channelMarginGross – Marge nach Pauschalgebühr (G31)', () => {
  it('zieht die Gebühr auf den Bruttopreis ab wie beim Verkauf (E10)', () => {
    // 70.90 gross: net 59.58; fee 10.5 % of 70.90 = 7.44 + 0.48 = 7.92
    const m = channelMarginGross(7090, 0.19, 2775, etsy);
    expect(m.salesPriceNetEur).toBe(5958);
    expect(m.contributionMarginEur).toBe(5958 - 2775 - 792);
    expect(m.margin).toBeCloseTo(0.4013, 4);
  });

  it('ohne Gebühr entspricht sie der Marge vor Gebühren', () => {
    const ohne = channelMarginGross(3990, 0.19, 906, { feePercent: 0, feeFixed: 0 });
    expect(ohne).toEqual(marginBeforeFees(3990, 0.19, 906));
  });

  it('liefert bei Preis 0 eine Marge von 0 statt eines Fehlers', () => {
    expect(channelMarginGross(0, 0.19, 906, etsy).margin).toBe(0);
  });
});

describe('roundUpToNinety', () => {
  it('rundet auf den nächsten Betrag mit ,90 auf', () => {
    expect(roundUpToNinety(7072)).toBe(7090);
    expect(roundUpToNinety(7001)).toBe(7090);
  });

  it('lässt einen Betrag mit ,90 stehen', () => {
    expect(roundUpToNinety(7090)).toBe(7090);
  });

  it('springt über ,90 hinaus in den nächsten Euro', () => {
    expect(roundUpToNinety(7091)).toBe(7190);
    expect(roundUpToNinety(7099)).toBe(7190);
  });
});

describe('suggestGrossPrice – Preisvorschlag aus Zielmarge (G31)', () => {
  it('rechnet den Bruttopreis für die Zielmarge nach Etsy-Gebühr', () => {
    // (27.75 + 0.48) / (0.60 / 1.19 - 0.105) = 70.72 -> 70.90
    expect(suggestGrossPrice({ totalCostEur: 2775, vatRate: 0.19, targetMargin: 0.4, channels: [etsy] })).toBe(7090);
  });

  it('der teuerste Kanal bestimmt den Preis', () => {
    const nurShop = suggestGrossPrice({ totalCostEur: 2775, vatRate: 0.19, targetMargin: 0.4, channels: [shop] });
    const beide = suggestGrossPrice({ totalCostEur: 2775, vatRate: 0.19, targetMargin: 0.4, channels: [shop, etsy] });
    expect(nurShop).toBe(5890);
    expect(beide).toBe(7090);
  });

  it('erreicht die Zielmarge auf jedem Kanal trotz Rundung', () => {
    for (let cost = 100; cost <= 20000; cost += 137) {
      const price = suggestGrossPrice({ totalCostEur: cost, vatRate: 0.19, targetMargin: 0.4, channels: [shop, etsy] });
      expect(price % 100).toBe(90);
      for (const c of [shop, etsy]) {
        expect(channelMarginGross(price, 0.19, cost, c).margin).toBeGreaterThanOrEqual(0.4);
      }
    }
  });

  it('ohne Kanal gilt die Marge vor Gebühren', () => {
    // 27.75 / 0.6 * 1.19 = 55.04 -> 55.90
    expect(suggestGrossPrice({ totalCostEur: 2775, vatRate: 0.19, targetMargin: 0.4, channels: [] })).toBe(5590);
  });

  it('meldet einen Fehler, wenn Zielmarge und Gebühr keinen Preis zulassen', () => {
    expect(() =>
      suggestGrossPrice({ totalCostEur: 2775, vatRate: 0.19, targetMargin: 0.8, channels: [{ feePercent: 0.2, feeFixed: 0 }] }),
    ).toThrow(PricingError);
  });

  it('lehnt eine Zielmarge ab 100 % ab', () => {
    expect(() => suggestGrossPrice({ totalCostEur: 2775, vatRate: 0.19, targetMargin: 1, channels: [] })).toThrow(
      PricingError,
    );
  });
});
