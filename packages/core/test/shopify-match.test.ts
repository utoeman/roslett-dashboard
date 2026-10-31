import { describe, expect, it } from 'vitest';
import { matchShopifyVariants, type ShopifyVariantRef } from '../src/shopify-match';

const shopify = (sku: string | null, n: number, quantity = 0): ShopifyVariantRef => ({
  sku,
  productId: `gid://shopify/Product/${n}`,
  variantId: `gid://shopify/ProductVariant/${n}`,
  inventoryItemId: `gid://shopify/InventoryItem/${n}`,
  inventoryQuantity: quantity,
  price: '39.90',
  unitCost: null,
});

describe('matchShopifyVariants', () => {
  it('ordnet Varianten über die SKU zu und übernimmt die Shopify-Menge', () => {
    const result = matchShopifyVariants(
      [{ variantId: 'v1', sku: 'ROS-KIS-0012-SAN-4545' }],
      [shopify('ROS-KIS-0012-SAN-4545', 1, 12)],
    );
    expect(result.matched).toEqual([
      { variantId: 'v1', sku: 'ROS-KIS-0012-SAN-4545', shopify: shopify('ROS-KIS-0012-SAN-4545', 1, 12) },
    ]);
    expect(result.missingInShopify).toEqual([]);
    expect(result.unknownInShopify).toEqual([]);
  });

  it('meldet Dashboard-Varianten ohne Treffer und Shopify-Varianten ohne Dashboard-SKU', () => {
    const result = matchShopifyVariants(
      [
        { variantId: 'v1', sku: 'ROS-KIS-0012-SAN-4545' },
        { variantId: 'v2', sku: 'ROS-KIS-0012-SAN-5050' },
      ],
      [shopify('ROS-KIS-0012-SAN-4545', 1), shopify('FREMD-1', 2), shopify(null, 3)],
    );
    expect(result.matched.map((m) => m.variantId)).toEqual(['v1']);
    expect(result.missingInShopify).toEqual([{ variantId: 'v2', sku: 'ROS-KIS-0012-SAN-5050' }]);
    expect(result.unknownInShopify.map((s) => s.variantId)).toEqual([
      'gid://shopify/ProductVariant/2',
      'gid://shopify/ProductVariant/3',
    ]);
  });

  it('ignoriert Groß-/Kleinschreibung und Leerzeichen am Rand der SKU', () => {
    const result = matchShopifyVariants(
      [{ variantId: 'v1', sku: 'ROS-KIS-0012-SAN-4545' }],
      [shopify(' ros-kis-0012-san-4545 ', 1)],
    );
    expect(result.matched.map((m) => m.variantId)).toEqual(['v1']);
  });

  it('ordnet nicht zu, wenn eine SKU in Shopify mehrfach vorkommt', () => {
    const result = matchShopifyVariants(
      [{ variantId: 'v1', sku: 'ROS-KIS-0012-SAN-4545' }],
      [shopify('ROS-KIS-0012-SAN-4545', 1), shopify('ROS-KIS-0012-SAN-4545', 2)],
    );
    expect(result.matched).toEqual([]);
    expect(result.duplicateInShopify).toEqual(['ROS-KIS-0012-SAN-4545']);
    expect(result.missingInShopify).toEqual([]);
    expect(result.unknownInShopify).toEqual([]);
  });
});
