/**
 * Stock planning on top of the journal. Functions only compute what to post;
 * the caller writes it. Batches are ordered by invoice date (FIFO), then id.
 * Allocation quantities are signed: issues negative, receipts positive.
 */

import type { Cents } from './money.js';
import { MoneyError, assertCents, round } from './money.js';

export class StockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StockError';
  }
}

export interface BatchStock {
  readonly id: string;
  /** ISO date of the supplier invoice; defines FIFO order. */
  readonly invoiceDate: string;
  readonly remaining: number;
}

/** `batchId` null marks a shortfall: issued without stock. */
export interface PlannedAllocation {
  readonly batchId: string | null;
  readonly quantity: number;
}

function fifoOrder<T extends BatchStock>(batches: readonly T[]): T[] {
  return [...batches].sort((a, b) =>
    a.invoiceDate !== b.invoiceDate ? (a.invoiceDate < b.invoiceDate ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}

function assertQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new StockError(`Menge muss eine positive ganze Zahl sein, erhalten: ${String(quantity)}`);
  }
}

/** FIFO issue; whatever stock cannot cover becomes a shortfall. */
export function planIssue(batches: readonly BatchStock[], quantity: number): PlannedAllocation[] {
  assertQuantity(quantity);
  const result: PlannedAllocation[] = [];
  let open = quantity;
  for (const batch of fifoOrder(batches)) {
    if (open === 0) break;
    if (batch.remaining <= 0) continue;
    const taken = Math.min(batch.remaining, open);
    result.push({ batchId: batch.id, quantity: -taken });
    open -= taken;
  }
  if (open > 0) result.push({ batchId: null, quantity: -open });
  return result;
}

/** Stocktake difference: a surplus goes to the newest batch, a deficit is issued FIFO. */
export function planStocktake(batches: readonly BatchStock[], difference: number): PlannedAllocation[] {
  if (difference === 0) return [];
  if (difference < 0) return planIssue(batches, -difference);
  assertQuantity(difference);
  const newest = fifoOrder(batches).at(-1);
  if (newest === undefined) {
    throw new StockError('Ein Inventur-Plus braucht mindestens einen Wareneingang dieser Variante.');
  }
  return [{ batchId: newest.id, quantity: difference }];
}

export interface Shortfall {
  readonly allocationId: string;
  /** Negative: the missing quantity. */
  readonly quantity: number;
}

export interface ShortfallResolution {
  readonly allocationId: string;
  readonly parts: PlannedAllocation[];
  /** Still missing after resolution (negative or 0). */
  readonly open: number;
}

/** Assigns open shortfalls (in the given order) to available stock, FIFO. */
export function planShortfallResolution(
  shortfalls: readonly Shortfall[],
  batches: readonly BatchStock[],
): ShortfallResolution[] {
  const available = fifoOrder(batches).map((batch) => ({ ...batch }));
  return shortfalls.map((shortfall) => {
    let missing = -shortfall.quantity;
    const parts: PlannedAllocation[] = [];
    for (const batch of available) {
      if (missing === 0) break;
      if (batch.remaining <= 0) continue;
      const taken = Math.min(batch.remaining, missing);
      parts.push({ batchId: batch.id, quantity: -taken });
      batch.remaining -= taken;
      missing -= taken;
    }
    return { allocationId: shortfall.allocationId, parts, open: missing === 0 ? 0 : -missing };
  });
}

export interface ReturnSource {
  /** Batch the line was issued from; null for its still open shortfall. */
  readonly batchId: string | null;
  readonly invoiceDate: string;
  /** Units from this source not returned yet. */
  readonly returnable: number;
}

export interface PlannedReturn {
  /** Units that only close the line's open shortfall; they never were in a batch. */
  readonly closedShortfall: number;
  readonly toBatches: PlannedAllocation[];
}

/** A return goes back where the line came from: open shortfall first, then batches newest first. */
export function planReturn(sources: readonly ReturnSource[], quantity: number): PlannedReturn {
  assertQuantity(quantity);
  const available = sources.reduce((total, s) => total + Math.max(0, s.returnable), 0);
  if (available < quantity) {
    throw new StockError(`Es können nur noch ${available} Stück zurückgenommen werden.`);
  }
  const shortfall = sources.reduce((total, s) => total + (s.batchId === null ? Math.max(0, s.returnable) : 0), 0);
  const closedShortfall = Math.min(shortfall, quantity);
  let open = quantity - closedShortfall;

  const batches = sources.flatMap((s) =>
    s.batchId === null ? [] : [{ id: s.batchId, invoiceDate: s.invoiceDate, remaining: s.returnable }],
  );
  const toBatches: PlannedAllocation[] = [];
  for (const batch of fifoOrder(batches).reverse()) {
    if (open === 0) break;
    if (batch.remaining <= 0) continue;
    const taken = Math.min(batch.remaining, open);
    toBatches.push({ batchId: batch.id, quantity: taken });
    open -= taken;
  }
  return { closedShortfall, toBatches };
}

export type DeliveryState = 'open' | 'partial' | 'complete';

export function deliveryState(ordered: number, delivered: number): DeliveryState {
  if (delivered <= 0) return 'open';
  return delivered >= ordered ? 'complete' : 'partial';
}

/** Purchase from a supplier or own production; production numbers run separately. */
export type ReceiptKind = 'purchase' | 'production';

export function receiptPrefix(kind: ReceiptKind): string {
  return kind === 'production' ? 'PR' : 'WE';
}

export function receiptNumber(year: number, sequence: number, kind: ReceiptKind = 'purchase'): string {
  return `${receiptPrefix(kind)}-${year}-${String(sequence).padStart(3, '0')}`;
}

/** ECB convention: `foreignPerEur` units of foreign currency buy 1 EUR. */
export function convertToEur(amountMinor: Cents, foreignPerEur: number): Cents {
  assertCents(amountMinor, 'Fremdwährungsbetrag');
  if (!Number.isFinite(foreignPerEur) || foreignPerEur <= 0) {
    throw new MoneyError(`Wechselkurs muss größer als null sein, erhalten: ${String(foreignPerEur)}`);
  }
  return round(amountMinor / foreignPerEur);
}

export interface ValuedBatch extends BatchStock {
  /** Landed cost per unit in EUR cents. */
  readonly landedCostEur: Cents;
}

export interface StockValuation {
  readonly units: number;
  readonly valueEur: Cents;
  /** Weighted average of remaining stock; without stock the newest batch's cost, without batches null. */
  readonly averageCostEur: Cents | null;
}

/** FIFO valuation: each remaining unit keeps the landed cost of its batch. */
export function valueStock(batches: readonly ValuedBatch[]): StockValuation {
  let units = 0;
  let value = 0;
  for (const batch of batches) {
    if (batch.remaining <= 0) continue;
    units += batch.remaining;
    value += batch.remaining * assertCents(batch.landedCostEur, 'Einstand');
  }
  const newest = fifoOrder(batches).at(-1);
  return {
    units,
    valueEur: round(value),
    averageCostEur: units > 0 ? round(value / units) : (newest?.landedCostEur ?? null),
  };
}
