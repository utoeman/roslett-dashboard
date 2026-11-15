/**
 * Domain types of the calculation engine. Plain data, no Vue, no database.
 */

import type { Cents, Rate } from './money.js';

// ---------------------------------------------------------------------------
// Cost items
// ---------------------------------------------------------------------------

/** Fixed amount per unit or a percentage of the base value. */
export type CostItemKind = 'fix' | 'percent';

/**
 * How shipment costs are split: by goods value (default, freight and duty
 * usually follow value) or by quantity (e.g. packaging per unit).
 */
export type DistributionMethod = 'value' | 'quantity';

export interface CostItem {
  readonly id: string;
  /** `null` means global. */
  readonly variantId: string | null;
  readonly label: string;
  readonly kind: CostItemKind;
  /** Cents for `fix`, a rate for `percent` (0.15 = 15 %). */
  readonly value: Cents | Rate;
  /** Deductible input tax (import VAT) stays out of the cost price; duty goes in. */
  readonly inputTaxDeductible: boolean;
  readonly active: boolean;
  /** Only relevant for shipment costs. */
  readonly distributionMethod: DistributionMethod;
}

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

/** Batch input before additional costs are distributed. */
export interface BatchItem {
  readonly id: string;
  readonly variantId: string;
  readonly quantity: number;
  /** Goods value of the position in EUR cents. */
  readonly goodsValueEur: Cents;
}

// ---------------------------------------------------------------------------
// Additional cost distribution
// ---------------------------------------------------------------------------

/** A shipment-level cost such as freight or customs duty. */
export interface AdditionalCost {
  readonly label: string;
  readonly amountEur: Cents;
  readonly distributionMethod: DistributionMethod;
}

export interface DistributedAdditionalCosts {
  readonly batchId: string;
  readonly additionalCostsEur: Cents;
  /** Goods value plus additional costs of the position. */
  readonly totalLandedCostEur: Cents;
  /** Rounded landed cost per unit. */
  readonly landedCostEur: Cents;
  /**
   * Remainder from dividing by quantity; positive means the unit prices sum
   * to less than the position. Reported instead of silently dropped.
   */
  readonly roundingDifferenceEur: Cents;
}

export interface DistributionResult {
  readonly items: readonly DistributedAdditionalCosts[];
  readonly additionalCostsTotalEur: Cents;
  readonly goodsValueTotalEur: Cents;
}

// ---------------------------------------------------------------------------
// Channels and prices
// ---------------------------------------------------------------------------

/**
 * `same_margin`: price is derived back from the target margin after fees.
 * `fixed`: price is given; only the resulting margin is computed.
 */
export type PricingRule = 'same_margin' | 'fixed';

export interface Channel {
  readonly id: string;
  readonly name: string;
  /** Fee as a rate of the sales price, 0.065 = 6.5 %. */
  readonly feePercent: Rate;
  /** Fixed fee per sale in EUR cents. */
  readonly feeFixed: Cents;
  readonly pricingRule: PricingRule;
  readonly active: boolean;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** One line of the cost breakdown. */
export interface CostRow {
  readonly label: string;
  readonly amountEur: Cents;
  /** Excluded from the cost price because input tax is deductible. */
  readonly excluded: boolean;
}

export interface TotalCostResult {
  readonly landedCostEur: Cents;
  readonly rows: readonly CostRow[];
  readonly totalCostEur: Cents;
  /** Sum of excluded rows, informational only. */
  readonly inputTaxEur: Cents;
}

export interface MarginResult {
  readonly salesPriceNetEur: Cents;
  readonly totalCostEur: Cents;
  readonly contributionMarginEur: Cents;
  /** Contribution / net sales price. */
  readonly margin: Rate;
  /** Contribution / total cost. */
  readonly markup: Rate;
}

