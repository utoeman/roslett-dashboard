import { describe, expect, it } from 'vitest';
import { SkuError, buildSku, buildVariantLabel, skuSize } from '../src/sku';

describe('buildSku', () => {
  it('baut die volle SKU', () => {
    expect(buildSku({ categoryCode: 'KIS', productNumber: 12, colorCode: 'SAN', size: '45×45' })).toBe(
      'TRD-KIS-0012-SAN-4545',
    );
  });

  it('laesst fehlende Farbe oder Groesse weg', () => {
    expect(buildSku({ categoryCode: 'KRZ', productNumber: 3 })).toBe('TRD-KRZ-0003');
    expect(buildSku({ categoryCode: 'KRZ', productNumber: 3, colorCode: 'NAT' })).toBe('TRD-KRZ-0003-NAT');
    expect(buildSku({ categoryCode: 'VAS', productNumber: 7, size: 'Ø 20' })).toBe('TRD-VAS-0007-20');
  });

  it('normalisiert Kleinbuchstaben in Kuerzeln', () => {
    expect(buildSku({ categoryCode: 'kis', productNumber: 1, colorCode: 'san' })).toBe('TRD-KIS-0001-SAN');
  });

  it('lehnt ungueltige Kuerzel ab', () => {
    expect(() => buildSku({ categoryCode: 'KI', productNumber: 1 })).toThrow(SkuError);
    expect(() => buildSku({ categoryCode: 'KIS', productNumber: 1, colorCode: 'SA1' })).toThrow(SkuError);
  });

  it('verlangt eine Produktnummer von 1 bis 9999', () => {
    expect(buildSku({ categoryCode: 'KIS', productNumber: 9999 })).toBe('TRD-KIS-9999');
    expect(() => buildSku({ categoryCode: 'KIS', productNumber: 0 })).toThrow(/Produktnummer/);
    expect(() => buildSku({ categoryCode: 'KIS', productNumber: 10000 })).toThrow(/Produktnummer/);
    expect(() => buildSku({ categoryCode: 'KIS', productNumber: 1.5 })).toThrow(/Produktnummer/);
  });
});

describe('skuSize', () => {
  it('entfernt Mass-Trenner zwischen Zahlen', () => {
    expect(skuSize('45×45')).toBe('4545');
    expect(skuSize('40 x 150')).toBe('40150');
    expect(skuSize('40X150')).toBe('40150');
    expect(skuSize('30*40')).toBe('3040');
  });

  it('behaelt Buchstaben als Grossbuchstaben', () => {
    expect(skuSize('m')).toBe('M');
    expect(skuSize('XL')).toBe('XL');
    expect(skuSize('Ø 20 cm')).toBe('20CM');
  });

  it('ergibt null fuer leere Eingaben', () => {
    expect(skuSize(undefined)).toBeNull();
    expect(skuSize('   ')).toBeNull();
  });

  it('lehnt Groessen ohne verwertbares Zeichen ab', () => {
    expect(() => skuSize('–')).toThrow(SkuError);
  });
});

describe('buildVariantLabel', () => {
  it('setzt Farbe und Groesse zusammen', () => {
    expect(buildVariantLabel('Sand', '45×45')).toBe('Sand 45×45');
    expect(buildVariantLabel('Sand', null)).toBe('Sand');
    expect(buildVariantLabel(null, '45×45')).toBe('45×45');
  });

  it('heisst ohne beides Standard', () => {
    expect(buildVariantLabel(null, null)).toBe('Standard');
    expect(buildVariantLabel(undefined, '  ')).toBe('Standard');
  });
});
