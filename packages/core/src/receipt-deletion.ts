/**
 * Deleting a posted goods receipt (G32). Allowed only while nothing but the
 * receipt's own postings (and their reversals) uses its batches; Shopify gets
 * back what was sent for them.
 */

/** A journal entry with an allocation on one of the receipt's batches. */
export interface DeletionEntry {
  readonly id: string;
  readonly kind: string;
  readonly reversesId: string | null;
  readonly variantId: string;
}

/** A row of `shopify_inventory_pushes` for one of those entries. */
export interface DeletionPush {
  readonly stockEntryId: string;
  readonly delta: number;
  readonly reason: 'pushed' | 'aligned' | 'before_stage4';
  readonly locationId: string | null;
}

export interface ReceiptDeletionPlan {
  /** The receipt's postings and their reversals; deleted with the receipt. */
  readonly entryIds: string[];
  /** Kinds of other entries using the batches, sorted; any of them blocks the deletion. */
  readonly blockedBy: string[];
  /** Adjustment that takes back what Shopify received, per variant and location. */
  readonly shopify: { variantId: string; locationId: string; delta: number }[];
}

export function planReceiptDeletion(entries: readonly DeletionEntry[], pushes: readonly DeletionPush[]): ReceiptDeletionPlan {
  const own = new Set(entries.filter((e) => e.kind === 'goods_receipt').map((e) => e.id));
  // Reversals of own postings (and reversals of those) belong to the receipt too.
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of entries) {
      if (!own.has(e.id) && e.reversesId !== null && own.has(e.reversesId)) {
        own.add(e.id);
        grew = true;
      }
    }
  }

  const blockedBy = [...new Set(entries.filter((e) => !own.has(e.id)).map((e) => e.kind))].sort();

  const variantOf = new Map(entries.map((e) => [e.id, e.variantId]));
  const sent = new Map<string, { variantId: string; locationId: string; delta: number }>();
  for (const p of pushes) {
    if (p.reason !== 'pushed' || p.locationId === null || !own.has(p.stockEntryId)) continue;
    const variantId = variantOf.get(p.stockEntryId);
    if (variantId === undefined) continue;
    const key = `${variantId}|${p.locationId}`;
    const current = sent.get(key) ?? { variantId, locationId: p.locationId, delta: 0 };
    sent.set(key, { ...current, delta: current.delta + p.delta });
  }

  return {
    entryIds: [...own],
    blockedBy,
    shopify: [...sent.values()].filter((s) => s.delta !== 0).map((s) => ({ ...s, delta: -s.delta })),
  };
}
