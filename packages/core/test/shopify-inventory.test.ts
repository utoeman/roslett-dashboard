import { describe, expect, it } from 'vitest';
import { PUSHED_KINDS, inventoryReason, planInventoryPush } from '../src/shopify-inventory';

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
    expect(plan.changes).toEqual([
      { variantId: 'v1', sku: 'ROS-KIS-0012-SAN-4545', inventoryItemId: 'gid://shopify/InventoryItem/1', delta: 40, entryIds: ['e1', 'e3'] },
      { variantId: 'v2', sku: 'ROS-KIS-0012-SAN-5050', inventoryItemId: 'gid://shopify/InventoryItem/2', delta: 12, entryIds: ['e2'] },
    ]);
  });

  it('ist leer ohne offene Buchungen', () => {
    expect(planInventoryPush([], linked)).toEqual({ changes: [], unlinked: [] });
  });

  it('überspringt Varianten ohne Shopify-Verknüpfung und überträgt den Rest', () => {
    const plan = planInventoryPush(
      [
        { entryId: 'e1', variantId: 'v9', quantity: 5 },
        { entryId: 'e2', variantId: 'v1', quantity: 3 },
        { entryId: 'e3', variantId: 'v9', quantity: 2 },
        { entryId: 'e4', variantId: 'v8', quantity: 1 },
      ],
      linked,
    );
    expect(plan.changes.map((c) => [c.variantId, c.delta, c.entryIds])).toEqual([['v1', 3, ['e2']]]);
    expect(plan.unlinked).toEqual(['v9', 'v8']);
  });
});

describe('inventoryReason', () => {
  it('ordnet jeder übertragenen Buchungsart einen Shopify-Grund zu', () => {
    expect(inventoryReason('goods_receipt')).toBe('received');
    expect(inventoryReason('shrinkage')).toBe('shrinkage');
    expect(inventoryReason('stocktake')).toBe('cycle_count_available');
    expect(inventoryReason('own_use')).toBe('correction');
    expect(inventoryReason('supplier_return')).toBe('correction');
    expect(inventoryReason('reversal')).toBe('correction');
  });

  it('überträgt nie Verkäufe und Retouren, die kommen aus Shopify', () => {
    expect(PUSHED_KINDS).not.toContain('sale');
    expect(PUSHED_KINDS).not.toContain('return');
  });
});
