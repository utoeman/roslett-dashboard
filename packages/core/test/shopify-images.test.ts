import { describe, expect, it } from 'vitest';
import { ImageUploadError, assertStagedResource, checkImageUpload } from '../src/shopify-images';

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
