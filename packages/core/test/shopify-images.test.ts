import { describe, expect, it } from 'vitest';
import { ImageUploadError, assertStagedResource, checkImageUpload, planVariantMedia, variantsOfColor } from '../src/shopify-images';

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

describe('planVariantMedia', () => {
  const v = (n: number) => `gid://shopify/ProductVariant/${n}`;
  const bild = 'gid://shopify/MediaImage/10';
  const anderes = 'gid://shopify/MediaImage/20';

  it('hängt das Bild an Varianten ohne Bild an', () => {
    expect(planVariantMedia([{ variantId: v(1), mediaId: null }], [v(1)], bild)).toEqual({ detach: [], append: [v(1)] });
  });

  it('ersetzt das bisherige Bild einer Zielvariante', () => {
    expect(planVariantMedia([{ variantId: v(1), mediaId: anderes }], [v(1)], bild)).toEqual({
      detach: [{ variantId: v(1), mediaId: anderes }],
      append: [v(1)],
    });
  });

  it('lässt Varianten unverändert, die das Bild schon zeigen', () => {
    expect(planVariantMedia([{ variantId: v(1), mediaId: bild }], [v(1)], bild)).toEqual({ detach: [], append: [] });
  });

  it('löst das Bild von Varianten, die nicht mehr dazugehören', () => {
    expect(
      planVariantMedia(
        [
          { variantId: v(1), mediaId: bild },
          { variantId: v(2), mediaId: anderes },
        ],
        [],
        bild,
      ),
    ).toEqual({ detach: [{ variantId: v(1), mediaId: bild }], append: [] });
  });

  it('behandelt Zielvarianten, die Shopify nicht listet, wie Varianten ohne Bild', () => {
    expect(planVariantMedia([], [v(3)], bild)).toEqual({ detach: [], append: [v(3)] });
  });
});
