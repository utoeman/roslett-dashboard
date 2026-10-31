import { describe, expect, it } from 'vitest';
import { InventoryPushError, planInventoryPush } from '../src/shopify-inventory';

const linked = new Map([
  ['v1', { sku: 'ROS-KIS-0012-SAN-4545', inventoryItemId: 'gid://shopify/InventoryItem/1' }],
  ['v2', { sku: 'ROS-KIS-0012-SAN-5050', inventoryItemId: 'gid://shopify/InventoryItem/2' }],
]);

describe('planInventoryPush', () => {
  it('fasst offene Buchungen je Variante zu einer relativen Änderung zusammen', () => {
    const plan = planInventoryPush(
      [
        { entryId: 'e1', variantId: 'v1', quantity: 30 },
        { entryId: 'e2', variantId: 'v2', quantity: 12 },
        { entryId: 'e3', variantId: 'v1', quantity: 10 },
      ],
      linked,
    );
    expect(plan).toEqual([
      { variantId: 'v1', sku: 'ROS-KIS-0012-SAN-4545', inventoryItemId: 'gid://shopify/InventoryItem/1', delta: 40, entryIds: ['e1', 'e3'] },
      { variantId: 'v2', sku: 'ROS-KIS-0012-SAN-5050', inventoryItemId: 'gid://shopify/InventoryItem/2', delta: 12, entryIds: ['e2'] },
    ]);
  });

  it('ist leer ohne offene Buchungen', () => {
    expect(planInventoryPush([], linked)).toEqual([]);
  });

  it('lehnt Varianten ohne Shopify-Verknüpfung ab', () => {
    expect(() => planInventoryPush([{ entryId: 'e1', variantId: 'v9', quantity: 5 }], linked)).toThrow(InventoryPushError);
  });
});
