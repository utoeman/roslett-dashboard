import { describe, expect, it } from 'vitest';
import { planPriceChanges, type PriceSource } from '../src/shopify-prices';

const row = (extra: Partial<PriceSource> = {}, shopify: Partial<PriceSource['shopify']> = {}): PriceSource => ({
  variantId: 'v1',
  sku: 'ROS-KIS-0012-SAN-4545',
  priceGross: 3990,
  costEur: 948,
  ...extra,
  shopify: {
    variantId: 'gid://shopify/ProductVariant/1',
    productId: 'gid://shopify/Product/1',
    inventoryItemId: 'gid://shopify/InventoryItem/1',
    price: '39.90',
    unitCost: '9.48',
    ...shopify,
  },
});

describe('planPriceChanges', () => {
  it('meldet keine Änderung, wenn Preis und Kosten übereinstimmen', () => {
    expect(planPriceChanges([row()])).toEqual({ changes: [], missingPrice: [] });
  });

  it('übernimmt einen geänderten Preis mit altem und neuem Wert', () => {
    const { changes } = planPriceChanges([row({ priceGross: 4490 })]);
    expect(changes).toEqual([
      {
        variantId: 'v1',
        sku: 'ROS-KIS-0012-SAN-4545',
        shopifyVariantId: 'gid://shopify/ProductVariant/1',
        productId: 'gid://shopify/Product/1',
        inventoryItemId: 'gid://shopify/InventoryItem/1',
        price: { from: 3990, to: 4490 },
        cost: null,
      },
    ]);
  });

  it('setzt fehlende Kosten in Shopify', () => {
    const [change] = planPriceChanges([row({}, { unitCost: null })]).changes;
    expect(change?.cost).toEqual({ from: null, to: 948 });
    expect(change?.price).toBeNull();
  });

  it('lässt Kosten in Ruhe, wenn das Dashboard keinen Einstand kennt', () => {
    expect(planPriceChanges([row({ costEur: null }, { unitCost: '5.00' })]).changes).toEqual([]);
  });

  it('meldet Varianten ohne Preis und überträgt dort nur die Kosten', () => {
    const result = planPriceChanges([row({ priceGross: null, costEur: 1000 })]);
    expect(result.missingPrice).toEqual(['ROS-KIS-0012-SAN-4545']);
    expect(result.changes[0]?.price).toBeNull();
    expect(result.changes[0]?.cost).toEqual({ from: 948, to: 1000 });
  });
});
