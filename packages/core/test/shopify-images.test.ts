import { describe, expect, it } from 'vitest';
import {
  ImageUploadError,
  altWithColor,
  assertStagedResource,
  checkImageUpload,
  colorFromAlt,
  planVariantImages,
  variantsOfColor,
} from '../src/shopify-images';

describe('checkImageUpload', () => {
  it('akzeptiert JPEG, PNG und WebP bis 20 MB', () => {
    expect(() => checkImageUpload({ filename: 'kissen.jpg', mimeType: 'image/jpeg', fileSize: 2_000_000 })).not.toThrow();
    expect(() => checkImageUpload({ filename: 'kissen.webp', mimeType: 'image/webp', fileSize: 20 * 1024 * 1024 })).not.toThrow();
  });

  it('lehnt andere Dateitypen ab', () => {
    expect(() => checkImageUpload({ filename: 'datenblatt.pdf', mimeType: 'application/pdf', fileSize: 1000 })).toThrow(ImageUploadError);
  });

  it('lehnt leere und zu große Dateien ab', () => {
    expect(() => checkImageUpload({ filename: 'leer.png', mimeType: 'image/png', fileSize: 0 })).toThrow(ImageUploadError);
    expect(() => checkImageUpload({ filename: 'gross.png', mimeType: 'image/png', fileSize: 20 * 1024 * 1024 + 1 })).toThrow(
      'höchstens 20 MB',
    );
  });
});

describe('assertStagedResource', () => {
  it('akzeptiert nur Adressen des Shopify-Upload-Speichers', () => {
    expect(() =>
      assertStagedResource('https://shopify-staged-uploads.storage.googleapis.com/tmp/1/products/kissen.jpg'),
    ).not.toThrow();
    expect(() => assertStagedResource('https://example.com/kissen.jpg')).toThrow(ImageUploadError);
    expect(() => assertStagedResource('http://shopify-staged-uploads.storage.googleapis.com/x.jpg')).toThrow(ImageUploadError);
    expect(() => assertStagedResource('kein-link')).toThrow(ImageUploadError);
  });
});

describe('variantsOfColor', () => {
  const variants = [
    { colorId: 'olive', shopifyVariantId: 'gid://shopify/ProductVariant/1' },
    { colorId: 'olive', shopifyVariantId: 'gid://shopify/ProductVariant/2' },
    { colorId: 'sand', shopifyVariantId: 'gid://shopify/ProductVariant/3' },
    { colorId: 'olive', shopifyVariantId: null },
  ];

  it('liefert alle verknüpften Varianten einer Farbe über alle Größen', () => {
    expect(variantsOfColor(variants, 'olive')).toEqual(['gid://shopify/ProductVariant/1', 'gid://shopify/ProductVariant/2']);
  });

  it('lehnt eine Farbe ohne verknüpfte Variante ab', () => {
    expect(() => variantsOfColor(variants, 'weiss')).toThrow(ImageUploadError);
  });
});

describe('colorFromAlt', () => {
  const farben = ['Senfgelb', 'Aubergine'];

  it('liest die Farbe hinter dem letzten Komma', () => {
    expect(colorFromAlt('Kissen Leinen, Senfgelb', farben)).toBe('Senfgelb');
    expect(colorFromAlt('Kissen, groß, Aubergine', farben)).toBe('Aubergine');
  });

  it('ignoriert Groß-/Kleinschreibung und Leerzeichen', () => {
    expect(colorFromAlt('Kissen Leinen,  senfgelb ', farben)).toBe('Senfgelb');
  });

  it('liefert null ohne bekannte Farbe', () => {
    expect(colorFromAlt('Kissen Leinen', farben)).toBeNull();
    expect(colorFromAlt('Kissen, Raumansicht', farben)).toBeNull();
    expect(colorFromAlt(null, farben)).toBeNull();
  });
});

describe('altWithColor', () => {
  const farben = ['Senfgelb', 'Aubergine'];

  it('setzt die Farbe hinter den Produktnamen', () => {
    expect(altWithColor(null, 'Kissen Leinen', farben, 'Senfgelb')).toBe('Kissen Leinen, Senfgelb');
  });

  it('ersetzt eine vorhandene Farbe und behält eigenen Text', () => {
    expect(altWithColor('Raumansicht Sofa, Senfgelb', 'Kissen Leinen', farben, 'Aubergine')).toBe('Raumansicht Sofa, Aubergine');
  });

  it('entfernt die Farbe bei „keine“', () => {
    expect(altWithColor('Raumansicht Sofa, Senfgelb', 'Kissen Leinen', farben, null)).toBe('Raumansicht Sofa');
    expect(altWithColor('', 'Kissen Leinen', farben, null)).toBe('Kissen Leinen');
  });
});

describe('planVariantImages', () => {
  const v = (n: number) => `gid://shopify/ProductVariant/${n}`;
  const m = (n: number) => `gid://shopify/MediaImage/${n}`;
  const bild = (n: number, colorName: string | null, ready = true) => ({ mediaId: m(n), colorName, ready });

  it('macht das erste Foto einer Farbe zum Variantenbild aller Größen', () => {
    const plan = planVariantImages(
      [
        { variantId: v(1), colorName: 'Senfgelb', mediaId: null },
        { variantId: v(2), colorName: 'Senfgelb', mediaId: null },
      ],
      [bild(10, null), bild(11, 'Senfgelb'), bild(12, 'Senfgelb')],
    );
    expect(plan).toEqual({
      detach: [],
      append: [
        { variantId: v(1), mediaId: m(11) },
        { variantId: v(2), mediaId: m(11) },
      ],
      pending: false,
    });
  });

  it('ersetzt ein anderes Variantenbild und lässt passende unverändert', () => {
    const plan = planVariantImages(
      [
        { variantId: v(1), colorName: 'Senfgelb', mediaId: m(12) },
        { variantId: v(2), colorName: 'Aubergine', mediaId: m(20) },
      ],
      [bild(11, 'Senfgelb'), bild(12, 'Senfgelb'), bild(20, 'Aubergine')],
    );
    expect(plan).toEqual({
      detach: [{ variantId: v(1), mediaId: m(12) }],
      append: [{ variantId: v(1), mediaId: m(11) }],
      pending: false,
    });
  });

  it('löst das Variantenbild einer Farbe ohne Foto', () => {
    const plan = planVariantImages([{ variantId: v(1), colorName: 'Aubergine', mediaId: m(10) }], [bild(10, null)]);
    expect(plan).toEqual({ detach: [{ variantId: v(1), mediaId: m(10) }], append: [], pending: false });
  });

  it('wartet, solange das erste Foto noch verarbeitet wird', () => {
    const plan = planVariantImages(
      [{ variantId: v(1), colorName: 'Senfgelb', mediaId: m(12) }],
      [bild(11, 'Senfgelb', false), bild(12, 'Senfgelb')],
    );
    expect(plan).toEqual({ detach: [], append: [], pending: true });
  });

  it('lässt Varianten ohne Farbe unberührt', () => {
    const plan = planVariantImages([{ variantId: v(1), colorName: null, mediaId: m(10) }], [bild(11, 'Senfgelb')]);
    expect(plan).toEqual({ detach: [], append: [], pending: false });
  });
});
