/**
 * Relative stock changes for Shopify (G16): every journal entry is sent once,
 * summed per variant. Shopify owns the absolute quantity (invariant 2).
 */

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

export interface InventoryPushPlan {
  changes: InventoryChange[];
  /** Variants without a Shopify link; their entries stay open until they are linked. */
  unlinkedVariantIds: string[];
}

export function planInventoryPush(
  entries: readonly PendingEntry[],
  linked: ReadonlyMap<string, { sku: string; inventoryItemId: string }>,
): InventoryPushPlan {
  const byVariant = new Map<string, InventoryChange>();
  const unlinked = new Set<string>();
  for (const entry of entries) {
    const variant = linked.get(entry.variantId);
    if (variant === undefined) {
      unlinked.add(entry.variantId);
      continue;
    }
    const change = byVariant.get(entry.variantId) ?? { variantId: entry.variantId, ...variant, delta: 0, entryIds: [] };
    change.delta += entry.quantity;
    change.entryIds.push(entry.entryId);
    byVariant.set(entry.variantId, change);
  }
  return { changes: [...byVariant.values()], unlinkedVariantIds: [...unlinked] };
}

/**
 * After a push Shopify should hold what the dashboard holds, or less while a
 * sale is not imported yet. More means Shopify already carries the stock, e.g.
 * entered by hand before the variant was linked, and the push would count it twice.
 */
export function overshootsDashboard(line: { shopifyStock: number | null; delta: number; dashboardStock: number }): boolean {
  return line.shopifyStock !== null && line.shopifyStock + line.delta > line.dashboardStock;
}

/**
 * Journal kinds that change stock without Shopify knowing (stage 4). Sales,
 * returns and their reversals come from Shopify and are never sent back. A
 * reversal is sent only when the entry it reverses was sent.
 */
export const PUSHED_KINDS = ['goods_receipt', 'shrinkage', 'own_use', 'stocktake', 'supplier_return'] as const;

export type PushedKind = (typeof PUSHED_KINDS)[number] | 'reversal';

/** Shopify's adjustment reason, shown in its inventory history. */
export function inventoryReason(kind: PushedKind): string {
  if (kind === 'goods_receipt') return 'received';
  if (kind === 'shrinkage') return 'shrinkage';
  if (kind === 'stocktake') return 'cycle_count_available';
  return 'correction';
}
