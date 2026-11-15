/**
 * Pricing and margin calculation. Everything is net: for a VAT-registered
 * business, VAT passes through and never affects the margin.
 */

import type { Cents, Rate } from './money.js';
import { assertCents, formatPercent, round, share } from './money.js';
import type {
  Channel,
  CostItem,
  CostRow,
  MarginResult,
  TotalCostResult,
} from './types.js';

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingError';
  }
}

/** All active global cost items plus the active items of the variant. */
export function costItemsForVariant(
  items: readonly CostItem[],
  variantId: string,
): CostItem[] {
  return items.filter(
    (item) =>
      item.active && (item.variantId === null || item.variantId === variantId),
  );
}

/**
 * Total cost per unit from landed cost and cost items.
 *
 * Percentages refer to the landed cost. Costs that depend on the sales price
 * (channel fees) belong to the reverse calculation instead. Deductible input
 * tax is listed but not included; rounding happens only at the end.
 */
export function calculateTotalCost(
  landedCostEur: Cents,
  items: readonly CostItem[],
): TotalCostResult {
  assertCents(landedCostEur, 'Einstandspreis');

  const rows: CostRow[] = [];
  let chargeable = 0;
  let inputTax = 0;

  for (const item of items) {
    if (!item.active) continue;
    const raw =
      item.kind === 'percent'
        ? share(landedCostEur, item.value)
        : assertCents(item.value, `Kostenposition "${item.label}"`);

    if (item.inputTaxDeductible) {
      inputTax += raw;
    } else {
      chargeable += raw;
    }

    rows.push({
      label: item.label,
      amountEur: round(raw),
      excluded: item.inputTaxDeductible,
    });
  }

  return {
    landedCostEur,
    rows,
    totalCostEur: round(landedCostEur + chargeable),
    inputTaxEur: round(inputTax),
  };
}

/**
 * margin = contribution / net sales price, markup = contribution / total cost.
 * Cost 40, price 100: margin 60 %, markup 150 %. Always reported separately.
 *
 * A zero price or cost yields 0 instead of throwing, because the calculator
 * passes through such states while the user types.
 */
export function calculateMargin(
  salesPriceNetEur: Cents,
  totalCostEur: Cents,
): MarginResult {
  assertCents(salesPriceNetEur, 'Verkaufspreis');
  assertCents(totalCostEur, 'Selbstkosten');

  const contributionMargin = salesPriceNetEur - totalCostEur;

  return {
    salesPriceNetEur,
    totalCostEur,
    contributionMarginEur: contributionMargin,
    margin: salesPriceNetEur === 0 ? 0 : contributionMargin / salesPriceNetEur,
    markup: totalCostEur === 0 ? 0 : contributionMargin / totalCostEur,
  };
}

/**
 * Margin of a gross shelf price before channel fees and cost items: net price
 * minus landed cost. Shows how much room a product leaves at all.
 */
export function marginBeforeFees(priceGrossEur: Cents, vatRate: Rate, landedCostEur: Cents): MarginResult {
  assertCents(priceGrossEur, 'Verkaufspreis brutto');
  if (!Number.isFinite(vatRate) || vatRate < 0) {
    throw new PricingError(`Ungültiger MwSt-Satz: ${String(vatRate)}`);
  }
  return calculateMargin(round(priceGrossEur / (1 + vatRate)), landedCostEur);
}

type FlatFee = Pick<Channel, 'feePercent' | 'feeFixed'>;

/**
 * Margin of a gross shelf price on one channel after its flat fee. The fee is
 * charged on the gross price like on a sale (E10); shipping is left out.
 */
export function channelMarginGross(
  priceGrossEur: Cents,
  vatRate: Rate,
  totalCostEur: Cents,
  channel: FlatFee,
): MarginResult {
  const before = marginBeforeFees(priceGrossEur, vatRate, totalCostEur);
  if (priceGrossEur === 0) return before;
  const fees = round(share(priceGrossEur, channel.feePercent)) + assertCents(channel.feeFixed, 'Fixgebühr');
  return calculateMargin(before.salesPriceNetEur, totalCostEur + fees);
}

/** Smallest amount ending in ,90 that is not below the given amount. */
export function roundUpToNinety(amount: Cents): Cents {
  assertCents(amount, 'Betrag');
  const candidate = Math.floor(amount / 100) * 100 + 90;
  return candidate >= amount ? candidate : candidate + 100;
}

/**
 * Gross price that reaches the target margin on every channel (the most
 * expensive one decides), rounded up to ,90. Without channels the margin
 * before fees applies. Per channel:
 *
 *   price = (total cost + fixed fee) / ((1 - target margin) / (1 + VAT) - fee rate)
 */
export function suggestGrossPrice(parameters: {
  totalCostEur: Cents;
  vatRate: Rate;
  targetMargin: Rate;
  channels: readonly FlatFee[];
}): Cents {
  const { totalCostEur, vatRate, targetMargin } = parameters;
  assertCents(totalCostEur, 'Selbstkosten');
  if (!Number.isFinite(targetMargin) || targetMargin >= 1) {
    throw new PricingError('Die Zielmarge muss unter 100 % liegen.');
  }
  const channels = parameters.channels.length > 0 ? parameters.channels : [{ feePercent: 0, feeFixed: 0 }];

  let price = 0;
  for (const channel of channels) {
    const denominator = (1 - targetMargin) / (1 + vatRate) - channel.feePercent;
    if (denominator <= 0) {
      throw new PricingError(
        `Zielmarge ${formatPercent(targetMargin)} ist bei ${formatPercent(channel.feePercent)} Gebühr nicht erreichbar. ` +
          'Bitte die Zielmarge senken.',
      );
    }
    price = Math.max(price, Math.ceil((totalCostEur + channel.feeFixed) / denominator));
  }

  // Rounding the net price can cost a fraction of a percent; step up until every channel fits.
  let suggestion = roundUpToNinety(price);
  while (channels.some((c) => channelMarginGross(suggestion, vatRate, totalCostEur, c).margin < targetMargin)) {
    suggestion += 100;
  }
  return suggestion;
}
