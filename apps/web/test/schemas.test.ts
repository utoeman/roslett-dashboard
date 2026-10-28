/** Boundary tests: input parsing to cents and conversion for database columns. */

import { describe, expect, it } from 'vitest';
import {
  currencyCodeSchema,
  flagSchema,
  moneySchema,
  listQuerySchema,
  optionalText,
  requiredText,
  percentSchema,
} from '../shared/schemas/common.js';
import {
  createProductSchema,
  createVariantSchema,
  updateProductSchema,
  updateVariantSchema,
} from '../shared/schemas/product.js';
import { companySettingsSchema } from '../shared/schemas/company.js';
import { createCategorySchema, createVatRateSchema } from '../shared/schemas/master-data.js';
import {
  updateCostItemSchema,
  createCostItemSchema,
} from '../shared/schemas/cost-item.js';
import {
  updateChannelSchema,
  createChannelSchema,
} from '../shared/schemas/channel.js';
import { journalQuerySchema } from '../shared/schemas/stock-entry.js';
import { createSaleSchema, saleQuerySchema, updateSaleSchema } from '../shared/schemas/sale.js';
import { additionalCostSchema, createReceiptSchema } from '../shared/schemas/goods-receipt.js';
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

  it('meldet ein fehlendes Pflichtfeld auf Deutsch', () => {
    const result = requiredText('Notiz').safeParse(undefined);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Notiz darf nicht leer sein.');
    }
  });

  it('macht aus leerem Freitext null', () => {
    expect(optionalText().parse('')).toBeNull();
    expect(optionalText().parse('  ')).toBeNull();
    expect(optionalText().parse('Notiz')).toBe('Notiz');
  });
});

describe('Stammdaten-Schemas', () => {
  it('normalisiert Kürzel auf drei Großbuchstaben', () => {
    expect(createCategorySchema.parse({ code: ' kis ', name: 'Kissen', group: 'textile' }).code).toBe('KIS');
    expect(createCategorySchema.safeParse({ code: 'KISS', name: 'Kissen', group: 'textile' }).success).toBe(false);
    expect(createCategorySchema.safeParse({ code: 'KIS', name: 'Kissen', group: 'moebel' }).success).toBe(false);
  });

  it('liest MwSt-Sätze als Rate und Datum', () => {
    const e = createVatRateSchema.parse({ country: 'de', vatCategory: 'reduced', rate: '7', validFrom: '2024-01-01' });
    expect(e.country).toBe('DE');
    expect(e.rate).toBeCloseTo(0.07, 10);
    expect(createVatRateSchema.safeParse({ country: 'DE', vatCategory: 'standard', rate: '19', validFrom: '1.1.2024' }).success).toBe(false);
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
  const categoryId = '0b0f6d0e-6a3b-4f1e-9a5c-2d7e8f9a0b1c';

  it('nimmt ein Produkt ohne Varianten entgegen', () => {
    const e = createProductSchema.parse({ name: 'Vase', categoryId, basePriceGross: '39,90' });
    expect(e.variants).toBeUndefined();
    expect(e.basePriceGross).toBe(3990);
    expect(e.vatCategory).toBe('standard');
  });

  it('verlangt eine Kategorie und nimmt keine SKU an', () => {
    expect(createProductSchema.safeParse({ name: 'Vase' }).success).toBe(false);
    expect('sku' in createProductSchema.parse({ name: 'Vase', categoryId, sku: 'X' })).toBe(false);
  });

  it('nimmt ein Produkt mit mehreren Varianten entgegen', () => {
    const e = createProductSchema.parse({
      name: 'Kissen',
      categoryId,
      variants: [{ size: '50×50', priceGross: '44,90' }, { size: '60×60', size2: 'ignoriert' }],
    });
    expect(e.variants).toHaveLength(2);
    expect(e.variants?.[0]?.priceGross).toBe(4490);
    expect(e.variants?.[1]?.minimumStock).toBe(0);
  });

  it('kann Kategorie und Farbe/Größe beim Ändern nicht setzen', () => {
    expect('categoryId' in updateProductSchema.parse({ categoryId })).toBe(false);
    const v = updateVariantSchema.parse({ id: categoryId, size: 'XL', colorId: categoryId });
    expect('size' in v || 'colorId' in v).toBe(false);
  });

  it('nimmt Pflege- und Sicherheitshinweise am Produkt', () => {
    const e = updateProductSchema.parse({ careNotes: ' 30 °C Schonwaschgang ', safetyNotes: '' });
    expect(e.careNotes).toBe('30 °C Schonwaschgang');
    expect(e.safetyNotes).toBeNull();
  });
});

describe('Textilangaben an der Variante', () => {
  const id = '0b0f6d0e-6a3b-4f1e-9a5c-2d7e8f9a0b1c';

  it('nimmt Faser, Füllung, Herkunft und HS-Code beim Anlegen und Ändern', () => {
    const input = { fiber: '100 % Leinen', fiberFilling: '100 % Polyester', originCountry: 'tr', hsCode: '6304 92 00' };
    expect(createVariantSchema.parse({ size: '50×50', ...input })).toMatchObject({
      fiber: '100 % Leinen',
      fiberFilling: '100 % Polyester',
      originCountry: 'TR',
      hsCode: '63049200',
    });
    expect(updateVariantSchema.parse({ id, ...input }).hsCode).toBe('63049200');
  });

  it('macht leere Angaben zu null', () => {
    const v = updateVariantSchema.parse({ id, fiber: '', fiberFilling: '', originCountry: '', hsCode: '' });
    expect(v).toMatchObject({ fiber: null, fiberFilling: null, originCountry: null, hsCode: null });
  });

  it('lehnt falsche Ländercodes und HS-Codes ab', () => {
    expect(updateVariantSchema.safeParse({ id, originCountry: 'TUR' }).success).toBe(false);
    expect(updateVariantSchema.safeParse({ id, hsCode: '6304' }).success).toBe(false);
    expect(updateVariantSchema.safeParse({ id, hsCode: '6304AB00' }).success).toBe(false);
  });
});

describe('companySettingsSchema – Herstellerangaben', () => {
  const valid = { manufacturerName: 'Roslett', manufacturerAddress: 'Musterstraße 1\n10115 Berlin', manufacturerEmail: 'info@example.com' };

  it('nimmt vollständige Angaben', () => {
    expect(companySettingsSchema.parse(valid)).toEqual(valid);
  });

  it('verlangt Name, Adresse und eine gültige E-Mail', () => {
    expect(companySettingsSchema.safeParse({ ...valid, manufacturerName: '' }).success).toBe(false);
    expect(companySettingsSchema.safeParse({ ...valid, manufacturerAddress: ' ' }).success).toBe(false);
    expect(companySettingsSchema.safeParse({ ...valid, manufacturerEmail: 'keine-mail' }).success).toBe(false);
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

describe('journalQuerySchema – Zeitraum', () => {
  it('nimmt Von und Bis als ISO-Datum', () => {
    const query = journalQuerySchema.parse({ from: '2026-10-01', to: '2026-10-31' });
    expect(query).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('lehnt ein ungueltiges Datum ab', () => {
    expect(journalQuerySchema.safeParse({ from: '01.10.2026' }).success).toBe(false);
  });
});

describe('currencyCodeSchema – nur Waehrungen mit EZB-Kurs', () => {
  it('nimmt EUR und Referenzwaehrungen', () => {
    expect(currencyCodeSchema.parse('EUR')).toBe('EUR');
    expect(currencyCodeSchema.parse('TRY')).toBe('TRY');
  });

  it('lehnt Tippfehler und unbekannte Codes ab', () => {
    const result = currencyCodeSchema.safeParse('TRL');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe('Diese Währung wird nicht unterstützt.');
  });
});

describe('createReceiptSchema – Art des Belegs', () => {
  const base = { supplierId: '00000000-0000-4000-8000-000000000001', invoiceDate: '2026-10-25' };

  it('ist ohne Angabe ein Zukauf', () => {
    expect(createReceiptSchema.parse(base).kind).toBe('purchase');
  });

  it('nimmt Produktion an und lehnt Unbekanntes ab', () => {
    expect(createReceiptSchema.parse({ ...base, kind: 'production' }).kind).toBe('production');
    expect(createReceiptSchema.safeParse({ ...base, kind: 'gift' }).success).toBe(false);
  });
});

describe('additionalCostSchema – Kostenarten', () => {
  it('kennt Stoff und Zubehör für die Produktion', () => {
    expect(additionalCostSchema.parse({ kind: 'fabric', amount: '120,50' }).amount).toBe(12050);
    expect(additionalCostSchema.parse({ kind: 'accessories', amount: '8' }).kind).toBe('accessories');
  });
});

describe('Kanal – Versand und Porto', () => {
  it('setzt ohne Angabe Versand 0, keine Grenze und Porto 0', () => {
    const k = createChannelSchema.parse({ name: 'Shop' });
    expect(k.shippingPriceGross).toBe(0);
    expect(k.freeShippingFrom).toBeNull();
    expect(k.defaultPostage).toBe(0);
  });

  it('nimmt Beträge an und lässt die Grenze beim Ändern auf leer setzen', () => {
    const k = createChannelSchema.parse({ name: 'Shop', shippingPriceGross: '4,90', freeShippingFrom: '50', defaultPostage: '3,95' });
    expect(k).toMatchObject({ shippingPriceGross: 490, freeShippingFrom: 5000, defaultPostage: 395 });
    expect(updateChannelSchema.parse({ freeShippingFrom: null })).toEqual({ freeShippingFrom: null });
  });
});

describe('createSaleSchema', () => {
  const base = {
    channelId: '00000000-0000-4000-8000-000000000001',
    externalOrderNumber: '#1001',
    orderedAt: '2026-10-26',
    items: [{ variantId: '00000000-0000-4000-8000-000000000002', quantity: '2', unitPriceGross: '39,90' }],
  };

  it('setzt Lieferland DE und Rabatt 0; Versand und Porto bleiben offen für die Kanal-Vorbelegung', () => {
    const s = createSaleSchema.parse(base);
    expect(s.deliveryCountry).toBe('DE');
    expect(s.discountGross).toBe(0);
    expect(s.shippingRevenueGross).toBeUndefined();
    expect(s.postageCost).toBeUndefined();
    expect(s.items[0]).toMatchObject({ quantity: 2, unitPriceGross: 3990 });
  });

  it('schreibt den Ländercode groß und lehnt Unsinn ab', () => {
    expect(createSaleSchema.parse({ ...base, deliveryCountry: 'at' }).deliveryCountry).toBe('AT');
    expect(createSaleSchema.safeParse({ ...base, deliveryCountry: 'Österreich' }).success).toBe(false);
  });

  it('lehnt negative Beträge und leere Bestellungen ab', () => {
    expect(createSaleSchema.safeParse({ ...base, discountGross: '-1' }).success).toBe(false);
    expect(createSaleSchema.safeParse({ ...base, items: [] }).success).toBe(false);
    expect(createSaleSchema.safeParse({ ...base, externalOrderNumber: ' ' }).success).toBe(false);
  });
});

describe('Verkauf – Status und Filter', () => {
  it('erlaubt offen und versendet, Storno nur über die eigene Route', () => {
    expect(updateSaleSchema.parse({ status: 'shipped' })).toEqual({ status: 'shipped' });
    expect(updateSaleSchema.safeParse({ status: 'cancelled' }).success).toBe(false);
  });

  it('liest den Fehlmengen-Filter aus der Abfrage', () => {
    expect(saleQuerySchema.parse({}).shortfallOnly).toBe(false);
    expect(saleQuerySchema.parse({ shortfallOnly: 'true' }).shortfallOnly).toBe(true);
    expect(saleQuerySchema.safeParse({ status: 'returned' }).success).toBe(false);
  });
});
