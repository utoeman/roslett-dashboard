/**
 * Landed cost: distributing shipment costs (freight, duty) across the batch
 * positions of a shipment. Results are persisted per position. Import VAT is
 * deductible and must not be passed in.
 */

import type { MoneyError } from './money.js';
import {
  assertCents,
  distributeByWeight,
  round,
  sum,
} from './money.js';
import type {
  AdditionalCost,
  BatchItem,
  DistributedAdditionalCosts,
  DistributionResult,
} from './types.js';

export class DistributionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DistributionError';
  }
}

/**
 * Each cost is distributed by its own method (value or quantity), then the
 * shares are added up. No cent is lost or created. The unit price is rounded
 * last; the unavoidable remainder is reported as `roundingDifferenceEur`.
 */
export function distributeAdditionalCosts(
  items: readonly BatchItem[],
  additionalCosts: readonly AdditionalCost[],
): DistributionResult {
  if (items.length === 0) {
    throw new DistributionError(
      'Eine Sendung ohne Positionen kann keine Nebenkosten aufnehmen.',
    );
  }

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new DistributionError(
        `Position ${item.id}: Menge muss eine positive Ganzzahl sein, erhalten: ${String(item.quantity)}`,
      );
    }
    try {
      assertCents(item.goodsValueEur, `Warenwert der Position ${item.id}`);
    } catch (error) {
      /* c8 ignore next */
      throw new DistributionError((error as MoneyError).message);
    }
    if (item.goodsValueEur < 0) {
      throw new DistributionError(
        `Position ${item.id}: Warenwert darf nicht negativ sein.`,
      );
    }
  }

  const valueWeights = items.map((item) => item.goodsValueEur);
  const quantityWeights = items.map((item) => item.quantity);

  const shares = items.map(() => 0);
  for (const cost of additionalCosts) {
    assertCents(cost.amountEur, `Nebenkosten "${cost.label}"`);
    if (cost.amountEur === 0) continue;
    const weights =
      cost.distributionMethod === 'quantity' ? quantityWeights : valueWeights;
    const distributed = distributeByWeight(cost.amountEur, weights);
    for (let i = 0; i < shares.length; i += 1) {
      shares[i] = (shares[i] ?? 0) + (distributed[i] ?? 0);
    }
  }

  const resultItems: DistributedAdditionalCosts[] = items.map((item, i) => {
    const additionalCostsEur = shares[i] ?? 0;
    const totalLandedCostEur = item.goodsValueEur + additionalCostsEur;
    const landedCostEur = round(totalLandedCostEur / item.quantity);
    const roundingDifferenceEur =
      totalLandedCostEur - landedCostEur * item.quantity;
    return {
      batchId: item.id,
      additionalCostsEur,
      totalLandedCostEur,
      landedCostEur,
      roundingDifferenceEur,
    };
  });

  return {
    items: resultItems,
    additionalCostsTotalEur: sum(additionalCosts.map((c) => c.amountEur)),
    goodsValueTotalEur: sum(valueWeights),
  };
}
