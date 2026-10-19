/**
 * FIFO batch allocation.
 *
 * Issues consume the oldest batch with remaining stock first and may span
 * several batches. All functions are pure and never mutate their input, so
 * the calculator can preview an issue without posting it.
 */

import type { Cents } from './money.js';
import { round } from './money.js';
import type { Batch, BatchAllocation, FifoResult } from './types.js';

export class FifoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FifoError';
  }
}

/** Oldest receipt first; `id` breaks ties so the order is reproducible. */
export function sortFifo(batches: readonly Batch[]): Batch[] {
  return [...batches].sort((a, b) => {
    const diff = a.receivedAt.getTime() - b.receivedAt.getTime();
    if (diff !== 0) return diff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function availableQuantity(batches: readonly Batch[]): number {
  return batches.reduce((total, batch) => total + batch.quantityRemaining, 0);
}

/**
 * Allocates an issue to batches. Missing stock does not throw; it is
 * returned as `uncoveredQuantity`, and the caller decides whether negative
 * stock is allowed.
 */
export function allocateIssue(
  batches: readonly Batch[],
  quantity: number,
): FifoResult {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new FifoError(
      `Abgangsmenge muss eine positive Ganzzahl sein, erhalten: ${String(quantity)}`,
    );
  }

  const sorted = sortFifo(batches);
  const allocations: BatchAllocation[] = [];
  const after: Batch[] = [];
  let open = quantity;
  let costOfGoodsSold = 0;

  for (const batch of sorted) {
    if (open === 0 || batch.quantityRemaining <= 0) {
      after.push(batch);
      continue;
    }
    const taken = Math.min(batch.quantityRemaining, open);
    allocations.push({
      batchId: batch.id,
      quantity: taken,
      landedCostEur: batch.landedCostEur,
    });
    costOfGoodsSold += taken * batch.landedCostEur;
    open -= taken;
    after.push({ ...batch, quantityRemaining: batch.quantityRemaining - taken });
  }

  return {
    allocations,
    batchesAfter: after,
    costOfGoodsSoldEur: round(costOfGoodsSold),
    uncoveredQuantity: open,
  };
}

/**
 * Returns allocations to the exact batches they came from (returns, reversals).
 * Returning more than was ever received is rejected.
 */
export function returnToBatches(
  batches: readonly Batch[],
  allocations: readonly BatchAllocation[],
): Batch[] {
  const byId = new Map(batches.map((batch) => [batch.id, batch]));

  for (const allocation of allocations) {
    if (!Number.isInteger(allocation.quantity) || allocation.quantity <= 0) {
      throw new FifoError(
        `Rueckbuchungsmenge muss eine positive Ganzzahl sein, erhalten: ${String(allocation.quantity)}`,
      );
    }
    const batch = byId.get(allocation.batchId);
    if (batch === undefined) {
      throw new FifoError(
        `Charge ${allocation.batchId} ist nicht bekannt und kann nichts zurueckerhalten.`,
      );
    }
    const updated = batch.quantityRemaining + allocation.quantity;
    if (updated > batch.quantityReceived) {
      throw new FifoError(
        `Charge ${allocation.batchId}: Rueckbuchung von ${allocation.quantity} ueberschreitet die Eingangsmenge ` +
          `(Rest ${batch.quantityRemaining}, Eingang ${batch.quantityReceived}).`,
      );
    }
    byId.set(allocation.batchId, { ...batch, quantityRemaining: updated });
  }

  return batches.map((batch) => byId.get(batch.id) ?? batch);
}

/** Value of remaining stock at landed cost (not cost of goods sold). */
export function stockValue(batches: readonly Batch[]): Cents {
  return round(
    batches.reduce(
      (total, batch) => total + batch.quantityRemaining * batch.landedCostEur,
      0,
    ),
  );
}

/** Weighted average landed cost, for display only; valuation is always FIFO. */
export function averageLandedCost(batches: readonly Batch[]): Cents {
  const quantity = availableQuantity(batches);
  if (quantity <= 0) return 0;
  return round(stockValue(batches) / quantity);
}
