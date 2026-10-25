import { describe, expect, it } from 'vitest';
import { buildShopifyCsv, productHandle, toCsv, type ShopifyExportProduct } from '../src/shopify-csv';

const manufacturer = { name: 'Roslett', address: 'Musterstraße 1\n10115 Berlin', email: 'info@example.com' };

const kissen: ShopifyExportProduct = {
  number: 12,
  name: 'Leinenkissen Sand',
  description: 'Kissen aus Leinen.\nMit Reißverschluss.',
  categoryName: 'Kissen',
  textile: true,
  careNotes: '30 °C Schonwaschgang',
  safetyNotes: null,
  variants: [
    { sku: 'ROS-KIS-0012-SAN-4545', colorName: 'Sand', size: '45×45', priceGross: 3990, costEur: 948, fiber: '100 % Leinen', fiberFilling: null },
    { sku: 'ROS-KIS-0012-SAN-5050', colorName: 'Sand', size: '50×50', priceGross: 4490, costEur: null, fiber: '100 % Leinen', fiberFilling: null },
  ],
};

/** Rows as objects keyed by header, for readable assertions. */
function rowsOf(csvRows: string[][]): Record<string, string>[] {
  const [header, ...rows] = csvRows;
  return rows.map((row) => Object.fromEntries((header ?? []).map((h, i) => [h, row[i] ?? ''])));
}

describe('productHandle', () => {
  it('bildet einen stabilen Handle aus Name und Produktnummer', () => {
    expect(productHandle('Leinenkissen Sand', 12)).toBe('leinenkissen-sand-0012');
    expect(productHandle('Größe & Grün – Überwurf', 3)).toBe('groesse-gruen-ueberwurf-0003');
  });
});

describe('toCsv', () => {
  it('setzt Felder mit Komma, Anführungszeichen oder Zeilenumbruch in Anführungszeichen', () => {
    expect(toCsv([['a', 'b,c', 'say "hi"', 'x\ny']])).toBe('a,"b,c","say ""hi""","x\ny"\r\n');
  });
});

describe('buildShopifyCsv', () => {
  it('schreibt Produktangaben nur in die erste Zeile, Varianten in jede', () => {
    const [first, second] = rowsOf(buildShopifyCsv([kissen], manufacturer).rows);
    expect(first).toMatchObject({
      Title: 'Leinenkissen Sand',
      'URL handle': 'leinenkissen-sand-0012',
      Description: 'Kissen aus Leinen.<br>Mit Reißverschluss.',
      Vendor: 'Roslett',
      Type: 'Kissen',
      Status: 'draft',
      'Published on online store': 'FALSE',
      SKU: 'ROS-KIS-0012-SAN-4545',
      'Option1 name': 'Farbe',
      'Option1 value': 'Sand',
      'Option2 name': 'Größe',
      'Option2 value': '45×45',
      Price: '39.90',
      'Cost per item': '9.48',
      'Charge tax': 'TRUE',
    });
    expect(second).toMatchObject({ Title: '', 'URL handle': 'leinenkissen-sand-0012', Vendor: '', Price: '44.90', 'Cost per item': '' });
    expect(second?.['Option2 value']).toBe('50×50');
  });

  it('gibt Faser, Pflege und Hersteller als Produktmetafelder aus', () => {
    const [first, second] = rowsOf(buildShopifyCsv([kissen], manufacturer).rows);
    expect(first?.['Faser (product.metafields.custom.fiber)']).toBe('100 % Leinen');
    expect(first?.['Pflegehinweise (product.metafields.custom.care_instructions)']).toBe('30 °C Schonwaschgang');
    expect(first?.['Hersteller (product.metafields.custom.manufacturer)']).toBe(
      'Roslett\nMusterstraße 1\n10115 Berlin\ninfo@example.com',
    );
    expect(second?.['Faser (product.metafields.custom.fiber)']).toBe('');
  });

  it('lässt die Faser leer und warnt, wenn sie je Variante abweicht', () => {
    const mixed = {
      ...kissen,
      variants: [kissen.variants[0]!, { ...kissen.variants[1]!, fiber: '100 % Baumwolle' }],
    };
    const result = buildShopifyCsv([mixed], manufacturer);
    expect(rowsOf(result.rows)[0]?.['Faser (product.metafields.custom.fiber)']).toBe('');
    expect(result.warnings).toContain(
      '0012 Leinenkissen Sand: Faser je Variante unterschiedlich – in Shopify je Variante nachtragen.',
    );
  });

  it('warnt bei fehlenden Herstellerangaben, fehlender Faser und fehlendem Preis', () => {
    const noFiber = { ...kissen, variants: [{ ...kissen.variants[0]!, fiber: null, priceGross: null }] };
    const result = buildShopifyCsv([noFiber], null);
    expect(result.warnings).toEqual([
      'Herstellerangaben fehlen (Einstellungen → Hersteller).',
      '0012 Leinenkissen Sand: Faserangabe fehlt.',
      'ROS-KIS-0012-SAN-4545: kein Preis.',
    ]);
    expect(rowsOf(result.rows)[0]?.Vendor).toBe('');
  });

  it('nutzt die Shopify-Standardvariante ohne Farbe und Größe', () => {
    const vase: ShopifyExportProduct = {
      ...kissen,
      number: 7,
      name: 'Vase',
      textile: false,
      variants: [{ sku: 'ROS-VAS-0007', colorName: null, size: null, priceGross: 2900, costEur: 1100, fiber: null, fiberFilling: null }],
    };
    const [row] = rowsOf(buildShopifyCsv([vase], manufacturer).rows);
    expect(row).toMatchObject({ 'Option1 name': 'Title', 'Option1 value': 'Default Title', 'Option2 name': '' });
  });

  it('füllt fehlende Werte einer Option mit „Standard“', () => {
    const partial = {
      ...kissen,
      variants: [kissen.variants[0]!, { ...kissen.variants[1]!, colorName: null }],
    };
    const rows = rowsOf(buildShopifyCsv([partial], manufacturer).rows);
    expect(rows[1]?.['Option1 value']).toBe('Standard');
  });
});
