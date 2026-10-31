/**
 * Relative stock changes for Shopify (G16): every journal entry is sent once,
 * summed per variant. Shopify owns the absolute quantity (invariant 2).
 */

export class InventoryPushError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InventoryPushError';
  }
}

export interface PendingEntry {
  entryId: string;
  variantId: string;
  quantity: number;
}

export interface InventoryChange {
  variantId: string;
  sku: string;
  inventoryItemId: string;
  delta: number;
  entryIds: string[];
}

export function planInventoryPush(
  entries: readonly PendingEntry[],
  linked: ReadonlyMap<string, { sku: string; inventoryItemId: string }>,
): InventoryChange[] {
  const byVariant = new Map<string, InventoryChange>();
  for (const entry of entries) {
    const variant = linked.get(entry.variantId);
    if (variant === undefined) {
      throw new InventoryPushError('Eine Variante ist nicht mit Shopify verknüpft; bitte zuerst auf der Seite „Shopify“ verknüpfen.');
    }
    const change = byVariant.get(entry.variantId) ?? { variantId: entry.variantId, ...variant, delta: 0, entryIds: [] };
    change.delta += entry.quantity;
    change.entryIds.push(entry.entryId);
    byVariant.set(entry.variantId, change);
  }
  return [...byVariant.values()];
}
