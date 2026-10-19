/** Boundary tests: input parsing to cents and conversion for database columns. */

import { describe, expect, it } from 'vitest';
import {
  flagSchema,
  moneySchema,
  listQuerySchema,
  optionalText,
  requiredText,
  percentSchema,
} from '../shared/schemas/common.js';
import { skuSchema, createProductSchema } from '../shared/schemas/product.js';
import {
  updateCostItemSchema,
  createCostItemSchema,
} from '../shared/schemas/cost-item.js';
import {
  updateChannelSchema,
  createChannelSchema,
} from '../shared/schemas/channel.js';
import {
  centsToNumeric,
  numericToCents,
  numericToRate,
  rateToNumeric,
} from '../server/utils/money.js';

describe('flagSchema – Wahrheitswerte aus der Abfragezeichenkette', () => {
  const schema = flagSchema();

  it('liest "false" als falsch', () => {
    // z.coerce.boolean() would turn "false" into true.
    expect(schema.parse('false')).toBe(false);
    expect(schema.parse('0')).toBe(false);
  });

  it('liest "true" als wahr', () => {
    expect(schema.parse('true')).toBe(true);
    expect(schema.parse('1')).toBe(true);
  });

  it('nimmt echte Wahrheitswerte unveraendert', () => {
    expect(schema.parse(true)).toBe(true);
    expect(schema.parse(false)).toBe(false);
  });

  it('traegt selbst keinen Standardwert', () => {
    // Default is set by the caller; an inner `.default()` would break PATCH.
    expect(schema.safeParse(undefined).success).toBe(false);
    expect(schema.default(true).parse(undefined)).toBe(true);
    expect(schema.default(false).parse(undefined)).toBe(false);
  });
});

describe('listQuerySchema', () => {
  it('blendet Archivierte standardmaessig aus', () => {
    expect(listQuerySchema.parse({}).includeArchived).toBe(false);
  });

  it('respektiert includeArchived=false aus der Abfragezeichenkette', () => {
    const result = listQuerySchema.parse({ includeArchived: 'false' });
    expect(result.includeArchived).toBe(false);
  });

  it('respektiert includeArchived=true', () => {
    expect(
      listQuerySchema.parse({ includeArchived: 'true' }).includeArchived,
    ).toBe(true);
  });

  it('setzt sinnvolle Grenzen', () => {
    expect(listQuerySchema.parse({}).limit).toBe(100);
    expect(listQuerySchema.safeParse({ limit: '9999' }).success).toBe(false);
    expect(listQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(listQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);
  });
});

describe('moneySchema – Eingabe zu ganzzahligen Cent (Regel 1)', () => {
  const schema = moneySchema('Betrag');

  it('liest deutsche Schreibweise', () => {
    expect(schema.parse('24,90')).toBe(2490);
    expect(schema.parse('1.234,56')).toBe(123456);
    expect(schema.parse('0,85')).toBe(85);
    expect(schema.parse('0,05')).toBe(5);
  });

  it('liest englische Schreibweise', () => {
    expect(schema.parse('1,234.56')).toBe(123456);
    expect(schema.parse('24.90')).toBe(2490);
  });

  it('nimmt Zahlen als Euro-Betraege', () => {
    expect(schema.parse(24.9)).toBe(2490);
    expect(schema.parse(19.99)).toBe(1999);
    expect(schema.parse(0)).toBe(0);
  });

  it('verliert keinen Cent bei Fliesskomma-Fallstricken', () => {
    // 19.99 * 100 is 1998.9999999999998 in IEEE 754.
    expect(schema.parse(19.99)).toBe(1999);
    expect(schema.parse('19,99')).toBe(1999);
  });

  it('behandelt einen Trenner mit drei Ziffern als Tausendertrenner', () => {
    expect(schema.parse('1.234')).toBe(123400);
  });

  it('ignoriert Waehrungszeichen', () => {
    expect(schema.parse('€ 9,99')).toBe(999);
    expect(schema.parse('9,99 EUR')).toBe(999);
  });

  it('erkennt negative Betraege', () => {
    expect(schema.parse('-3,40')).toBe(-340);
  });

  it('lehnt Unsinn mit einer verstaendlichen Meldung ab', () => {
    const result = schema.safeParse('abc');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('Betrag');
    }
  });
});

describe('percentSchema – Eingabe zu Dezimalsatz', () => {
  const schema = percentSchema('Satz');

  it('rechnet Prozentangaben in Dezimalsaetze um', () => {
    expect(schema.parse('6,5')).toBeCloseTo(0.065, 10);
    expect(schema.parse('19')).toBeCloseTo(0.19, 10);
    expect(schema.parse('4,7')).toBeCloseTo(0.047, 10);
    expect(schema.parse(0)).toBe(0);
  });

  it('nimmt auch das Prozentzeichen entgegen', () => {
    expect(schema.parse('6,5 %')).toBeCloseTo(0.065, 10);
  });

  it('lehnt Werte ausserhalb des Bereichs ab', () => {
    expect(schema.safeParse('-1').success).toBe(false);
    expect(schema.safeParse('101').success).toBe(false);
  });

  it('lehnt Unsinn ab', () => {
    expect(schema.safeParse('abc').success).toBe(false);
  });
});

describe('requiredText und optionalText', () => {
  it('lehnt leere Pflichtfelder ab und nennt das Feld', () => {
    const result = requiredText('Name').safeParse('   ');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('Name');
    }
  });

  it('entfernt umgebende Leerzeichen', () => {
    expect(requiredText('Name').parse('  Vase  ')).toBe('Vase');
  });

  it('macht aus leerem Freitext null', () => {
    expect(optionalText().parse('')).toBeNull();
    expect(optionalText().parse('  ')).toBeNull();
    expect(optionalText().parse('Notiz')).toBe('Notiz');
  });
});

describe('skuSchema', () => {
  it('nimmt zulaessige Artikelnummern', () => {
    expect(skuSchema.parse('VASE-001')).toBe('VASE-001');
    expect(skuSchema.parse('kiss_50.a')).toBe('kiss_50.a');
  });

  it('lehnt Leerzeichen und Sonderzeichen ab', () => {
    expect(skuSchema.safeParse('HAT SPACE').success).toBe(false);
    expect(skuSchema.safeParse('A/B').success).toBe(false);
    expect(skuSchema.safeParse('').success).toBe(false);
  });
});

describe('createCostItemSchema – Art bestimmt die Bedeutung des Werts', () => {
  it('liest den Wert bei "fix" als Cent-Betrag', () => {
    const e = createCostItemSchema.parse({
      label: 'Verpackung',
      kind: 'fix',
      value: '0,85',
    });
    expect(e.value).toBe(85);
  });

  it('liest den Wert bei "prozent" als Dezimalsatz', () => {
    const e = createCostItemSchema.parse({
      label: 'Zoll',
      kind: 'percent',
      value: '4,7',
    });
    expect(e.value).toBeCloseTo(0.047, 10);
  });

  it('haelt Betrag und Satz auseinander', () => {
    // Same input, different value depending on kind.
    const alsBetrag = createCostItemSchema.parse({
      label: 'X',
      kind: 'fix',
      value: '2,5',
    });
    const alsSatz = createCostItemSchema.parse({
      label: 'X',
      kind: 'percent',
      value: '2,5',
    });
    expect(alsBetrag.value).toBe(250);
    expect(alsSatz.value).toBeCloseTo(0.025, 10);
  });

  it('setzt die Verteilmethode standardmaessig auf Warenwert (Regel 7)', () => {
    const e = createCostItemSchema.parse({
      label: 'Fracht',
      kind: 'fix',
      value: '10,00',
    });
    expect(e.distributionMethod).toBe('value');
  });

  it('merkt sich die Vorsteuerabzugsfaehigkeit (Regel 3)', () => {
    const eust = createCostItemSchema.parse({
      label: 'Einfuhrumsatzsteuer',
      kind: 'percent',
      value: '19',
      inputTaxDeductible: true,
    });
    const zoll = createCostItemSchema.parse({
      label: 'Zoll',
      kind: 'percent',
      value: '4,7',
    });
    expect(eust.inputTaxDeductible).toBe(true);
    expect(zoll.inputTaxDeductible).toBe(false);
  });
});

describe('Aendern-Schemas setzen keine Standardwerte', () => {
  // Regression: a PATCH with one field must not reset the others to defaults.

  it('Kanal: leerer Rumpf ergibt keine Felder', () => {
    expect(updateChannelSchema.parse({})).toEqual({});
  });

  it('Kanal: nur der Name laesst die Gebuehren unberuehrt', () => {
    const e = updateChannelSchema.parse({ name: 'Etsy' });
    expect(e).toEqual({ name: 'Etsy' });
    expect(e.feePercent).toBeUndefined();
    expect(e.feeFixed).toBeUndefined();
    expect(e.active).toBeUndefined();
  });

  it('Kanal: active=false bleibt false', () => {
    expect(updateChannelSchema.parse({ active: false })).toEqual({ active: false });
  });

  it('Kostenposition: nur die Art laesst die uebrigen Felder unberuehrt', () => {
    const e = updateCostItemSchema.parse({ kind: 'fix' });
    expect(e).toEqual({ kind: 'fix' });
    expect(e.active).toBeUndefined();
    expect(e.inputTaxDeductible).toBeUndefined();
  });

  it('Kostenposition: eine deaktivierte Position bleibt deaktiviert', () => {
    // Otherwise every edit would silently re-enable it.
    const e = updateCostItemSchema.parse({
      kind: 'percent',
      label: 'Zoll',
    });
    expect(e.active).toBeUndefined();
  });

  it('Anlege-Schemas behalten ihre Standardwerte', () => {
    const k = createChannelSchema.parse({ name: 'Neu' });
    expect(k.feePercent).toBe(0);
    expect(k.feeFixed).toBe(0);
    expect(k.active).toBe(true);
    expect(k.pricingRule).toBe('same_margin');
  });
});

describe('createChannelSchema', () => {
  it('trennt prozentuale und fixe Gebuehr', () => {
    const e = createChannelSchema.parse({
      name: 'Etsy',
      feePercent: '6,5',
      feeFixed: '0,20',
    });
    expect(e.feePercent).toBeCloseTo(0.065, 10);
    expect(e.feeFixed).toBe(20);
  });

  it('setzt vernuenftige Standardwerte', () => {
    const e = createChannelSchema.parse({ name: 'Ladenverkauf' });
    expect(e.feePercent).toBe(0);
    expect(e.feeFixed).toBe(0);
    expect(e.pricingRule).toBe('same_margin');
    expect(e.active).toBe(true);
  });
});

describe('createProductSchema', () => {
  it('nimmt ein Produkt ohne Varianten entgegen', () => {
    const e = createProductSchema.parse({ name: 'Vase', sku: 'VASE-1' });
    expect(e.variants).toBeUndefined();
    expect(e.sku).toBe('VASE-1');
  });

  it('nimmt ein Produkt mit mehreren Varianten entgegen', () => {
    const e = createProductSchema.parse({
      name: 'Kissen',
      variants: [
        { sku: 'K-50', label: '50x50', basePriceNet: '24,90' },
        { sku: 'K-60', label: '60x60' },
      ],
    });
    expect(e.variants).toHaveLength(2);
    expect(e.variants?.[0]?.basePriceNet).toBe(2490);
    expect(e.variants?.[1]?.vatRate).toBeCloseTo(0.19, 10);
  });
});

describe('Umrechnung an der Datenbankgrenze', () => {
  it('faehrt Cent verlustfrei hin und zurueck', () => {
    for (const cent of [0, 1, 85, 2490, 123456, -340, 999999]) {
      expect(numericToCents(centsToNumeric(cent))).toBe(cent);
    }
  });

  it('faehrt Dezimalsaetze verlustfrei hin und zurueck', () => {
    for (const satz of [0, 0.19, 0.065, 0.047, 0.0025]) {
      expect(numericToRate(rateToNumeric(satz))).toBeCloseTo(satz, 10);
    }
  });

  it('schreibt vier Nachkommastellen, wie es die Spalte verlangt', () => {
    expect(centsToNumeric(85)).toBe('0.8500');
    expect(centsToNumeric(2490)).toBe('24.9000');
    expect(rateToNumeric(0.065)).toBe('0.0650');
  });

  it('behandelt null durchgehend als null', () => {
    expect(centsToNumeric(null)).toBeNull();
    expect(centsToNumeric(undefined)).toBeNull();
    expect(numericToCents(null)).toBeNull();
    expect(rateToNumeric(null)).toBeNull();
    expect(numericToRate(null)).toBeNull();
  });

  it('liest den rohen Spaltenwert richtig', () => {
    // As returned by Postgres.
    expect(numericToCents('0.8500')).toBe(85);
    expect(numericToCents('24.9000')).toBe(2490);
    expect(numericToRate('0.0470')).toBeCloseTo(0.047, 10);
  });
});
