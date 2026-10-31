import { describe, expect, it } from 'vitest';
import {
  ProductPushError,
  buildProductSet,
  diffProductSet,
  productHandle,
  type ProductPushProduct,
  type ProductSetInput,
} from '../src/shopify-product';

const manufacturer = { name: 'Roslett', address: 'Musterstr. 1, 10115 Berlin', email: 'info@example.com' };

const product = (extra: Partial<ProductPushProduct> = {}): ProductPushProduct => ({
  number: 12,
  name: 'Leinenkissen',
  description: 'Weich\nund fest',
  categoryName: 'Kissen',
  textile: true,
  careNotes: '40 °C',
  safetyNotes: null,
  archived: false,
  shopifyProductId: null,
  variants: [
    { sku: 'ROS-KIS-0012-SAN-4545', colorName: 'Sand', size: '45×45', priceGross: 3990, fiber: '100 % Leinen', fiberFilling: null, hsCode: '630492', originCountry: 'PT', shopifyVariantId: null },
    { sku: 'ROS-KIS-0012-SAN-5050', colorName: 'Sand', size: '50×50', priceGross: 4490, fiber: '100 % Leinen', fiberFilling: null, hsCode: null, originCountry: null, shopifyVariantId: null },
  ],
  ...extra,
});

describe('buildProductSet', () => {
  it('legt ein neues Produkt als Entwurf mit Handle, Optionen und Metafeldern an', () => {
    const { input, warnings } = buildProductSet(product(), manufacturer);
    expect(warnings).toEqual([]);
    expect(input).toMatchObject({
      handle: 'leinenkissen-0012',
      title: 'Leinenkissen',
      descriptionHtml: 'Weich<br>und fest',
      vendor: 'Roslett',
      productType: 'Kissen',
      status: 'DRAFT',
      productOptions: [
        { name: 'Farbe', values: [{ name: 'Sand' }] },
        { name: 'Größe', values: [{ name: '45×45' }, { name: '50×50' }] },
      ],
    });
    expect(input.id).toBeUndefined();
    expect(input.metafields).toEqual([
      { namespace: 'custom', key: 'fiber', type: 'multi_line_text_field', value: '100 % Leinen' },
      { namespace: 'custom', key: 'care_instructions', type: 'multi_line_text_field', value: '40 °C' },
      { namespace: 'custom', key: 'manufacturer', type: 'multi_line_text_field', value: 'Roslett\nMusterstr. 1, 10115 Berlin\ninfo@example.com' },
    ]);
    expect(input.variants[0]).toEqual({
      sku: 'ROS-KIS-0012-SAN-4545',
      price: '39.90',
      taxable: true,
      optionValues: [
        { optionName: 'Farbe', name: 'Sand' },
        { optionName: 'Größe', name: '45×45' },
      ],
      inventoryItem: { tracked: true, requiresShipping: true, harmonizedSystemCode: '630492', countryCodeOfOrigin: 'PT' },
      metafields: [{ namespace: 'custom', key: 'fiber', type: 'multi_line_text_field', value: '100 % Leinen' }],
    });
    // Always sent, so an emptied value is cleared in Shopify too.
    expect(input.variants[1]?.inventoryItem).toEqual({ tracked: true, requiresShipping: true, harmonizedSystemCode: null, countryCodeOfOrigin: null });
  });

  it('ändert bei verknüpften Produkten weder Handle noch Status und nutzt die IDs', () => {
    const { input } = buildProductSet(
      product({
        shopifyProductId: 'gid://shopify/Product/1',
        variants: [{ ...product().variants[0]!, shopifyVariantId: 'gid://shopify/ProductVariant/1' }],
      }),
      manufacturer,
    );
    expect(input.id).toBe('gid://shopify/Product/1');
    expect(input.handle).toBeUndefined();
    expect(input.status).toBeUndefined();
    expect(input.variants[0]?.id).toBe('gid://shopify/ProductVariant/1');
  });

  it('archiviert archivierte Produkte statt sie zu löschen', () => {
    expect(buildProductSet(product({ archived: true, shopifyProductId: 'gid://shopify/Product/1' }), manufacturer).input.status).toBe('ARCHIVED');
  });

  it('nutzt die Standardvariante ohne Farbe und Größe', () => {
    const { input } = buildProductSet(
      product({ variants: [{ ...product().variants[0]!, colorName: null, size: null }] }),
      manufacturer,
    );
    expect(input.productOptions).toEqual([{ name: 'Title', values: [{ name: 'Default Title' }] }]);
    expect(input.variants[0]?.optionValues).toEqual([{ optionName: 'Title', name: 'Default Title' }]);
  });

  it('lehnt Varianten ohne Preis und Produkte ohne Varianten ab', () => {
    expect(() =>
      buildProductSet(product({ variants: [{ ...product().variants[0]!, priceGross: null }] }), manufacturer),
    ).toThrow(ProductPushError);
    expect(() => buildProductSet(product({ variants: [] }), manufacturer)).toThrow(ProductPushError);
  });

  it('lässt die Marke in Shopify stehen, wenn Herstellerangaben fehlen', () => {
    const { input } = buildProductSet(product(), null);
    expect(input.vendor).toBeUndefined();
    expect(diffProductSet(input, { ...input, vendor: 'Alt' }).changes).toEqual([]);
  });

  it('warnt bei fehlender Faser, fehlendem Hersteller und je Variante unterschiedlicher Faser', () => {
    const { warnings } = buildProductSet(
      product({ variants: [{ ...product().variants[0]!, fiber: 'Leinen' }, { ...product().variants[1]!, fiber: 'Baumwolle' }] }),
      null,
    );
    expect(warnings).toEqual([
      'Herstellerangaben fehlen (Einstellungen → Hersteller).',
      'Faser je Variante unterschiedlich – nur an den Varianten gesetzt.',
    ]);
  });
});

describe('diffProductSet', () => {
  const desired = (): ProductSetInput => buildProductSet(product(), manufacturer).input;

  it('meldet für ein neues Produkt alles als neu', () => {
    const diff = diffProductSet(desired(), null);
    expect(diff.removedVariants).toEqual([]);
    expect(diff.changes).toContainEqual({ field: 'Titel', from: null, to: 'Leinenkissen' });
    expect(diff.changes).toContainEqual({ field: 'ROS-KIS-0012-SAN-5050 · Preis', from: null, to: '44.90' });
  });

  it('meldet nichts, wenn Shopify übereinstimmt', () => {
    expect(diffProductSet(desired(), desired())).toEqual({ changes: [], removedVariants: [] });
  });

  it('zeigt geänderte Felder mit altem Wert und Varianten, die Shopify verliert', () => {
    const current = desired();
    current.title = 'Leinen-Kissen';
    current.variants = [
      { ...current.variants[0]!, price: '34.90' },
      { ...current.variants[1]! },
      { sku: 'FREMD-1', price: '1.00', taxable: true, optionValues: [], inventoryItem: { tracked: true, requiresShipping: true, harmonizedSystemCode: null, countryCodeOfOrigin: null }, metafields: [] },
    ];
    expect(diffProductSet(desired(), current)).toEqual({
      changes: [
        { field: 'Titel', from: 'Leinen-Kissen', to: 'Leinenkissen' },
        { field: 'ROS-KIS-0012-SAN-4545 · Preis', from: '34.90', to: '39.90' },
      ],
      removedVariants: ['FREMD-1'],
    });
  });

  it('ignoriert den Status bei verknüpften Produkten', () => {
    const current = desired();
    const linked = { ...desired(), status: undefined };
    current.status = 'ACTIVE';
    expect(diffProductSet(linked, current).changes).toEqual([]);
  });
});

describe('productHandle', () => {
  it('bildet einen stabilen Handle aus Name und Produktnummer', () => {
    expect(productHandle('Leinenkissen Sand', 12)).toBe('leinenkissen-sand-0012');
    expect(productHandle('Größe & Grün – Überwurf', 3)).toBe('groesse-gruen-ueberwurf-0003');
  });
});
