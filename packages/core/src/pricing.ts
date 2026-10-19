/**
 * Pricing and margin calculation. Everything is net: for a VAT-registered
 * business, VAT passes through and never affects the margin.
 */

import type { Cents, Rate } from './money.js';
import { assertCents, formatPercent, round, share } from './money.js';
import type {
  Channel,
  ChannelPriceResult,
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
 * Sales price for a target margin. Percentage fees apply to the price we are
 * looking for, so they go into the denominator:
 *
 *   price = (total cost + fixed fees) / (1 - target margin - fee rate)
 *
 * A denominator <= 0 means no price can satisfy the target.
 */
export function calculateSalesPrice(parameters: {
  totalCostEur: Cents;
  targetMargin: Rate;
  feePercent?: Rate;
  feeFixedEur?: Cents;
}): Cents {
  const {
    totalCostEur,
    targetMargin,
    feePercent = 0,
    feeFixedEur = 0,
  } = parameters;

  assertCents(totalCostEur, 'Selbstkosten');
  assertCents(feeFixedEur, 'Fixgebuehr');

  if (!Number.isFinite(targetMargin)) {
    throw new PricingError(
      `Zielmarge ist keine gueltige Zahl: ${String(targetMargin)}`,
    );
  }
  if (!Number.isFinite(feePercent) || feePercent < 0) {
    throw new PricingError(
      `Gebuehrensatz muss endlich und nicht negativ sein, erhalten: ${String(feePercent)}`,
    );
  }
  if (targetMargin >= 1) {
    throw new PricingError(
      `Eine Zielmarge von ${formatPercent(targetMargin)} ist nicht erreichbar: ` +
        'die Marge muss unter 100 % liegen, weil der Deckungsbeitrag Teil des Verkaufspreises ist.',
    );
  }

  const denominator = 1 - targetMargin - feePercent;
  if (denominator <= 0) {
    // Shown to the user, hence German number formatting.
    throw new PricingError(
      `Zielmarge ${formatPercent(targetMargin)} und Gebuehren ` +
        `${formatPercent(feePercent)} ergeben zusammen ` +
        `${formatPercent(targetMargin + feePercent)} und lassen damit nichts ` +
        'fuer die Selbstkosten uebrig. Es gibt keinen Verkaufspreis, der diese Vorgabe erfuellt. ' +
        'Zielmarge senken oder einen guenstigeren Kanal waehlen.',
    );
  }

  return round((totalCostEur + feeFixedEur) / denominator);
}

/**
 * Channel price for a variant. `same_margin` derives the price from the
 * target margin after fees; `fixed` uses the given price, so the actual
 * margin may fall below the target.
 */
export function calculateChannelPrice(parameters: {
  channel: Channel;
  totalCostEur: Cents;
  targetMargin: Rate;
  fixedPriceEur?: Cents;
}): ChannelPriceResult {
  const { channel, totalCostEur, targetMargin, fixedPriceEur } = parameters;
  assertCents(totalCostEur, 'Selbstkosten');

  let salesPrice: Cents;
  if (channel.pricingRule === 'fixed') {
    if (fixedPriceEur === undefined) {
      throw new PricingError(
        `Kanal "${channel.name}" hat die Preisregel "fest", es wurde aber kein Festpreis uebergeben.`,
      );
    }
    salesPrice = assertCents(fixedPriceEur, 'Festpreis');
  } else {
    salesPrice = calculateSalesPrice({
      totalCostEur,
      targetMargin,
      feePercent: channel.feePercent,
      feeFixedEur: channel.feeFixed,
    });
  }

  // Round only after adding the fixed fee.
  const fees = round(share(salesPrice, channel.feePercent) + channel.feeFixed);
  const contributionMargin = salesPrice - totalCostEur - fees;

  return {
    channelId: channel.id,
    channelName: channel.name,
    salesPriceNetEur: salesPrice,
    feesEur: fees,
    totalCostEur,
    contributionMarginEur: contributionMargin,
    margin: salesPrice === 0 ? 0 : contributionMargin / salesPrice,
    markup: totalCostEur === 0 ? 0 : contributionMargin / totalCostEur,
  };
}

/** Margin left at a given price and channel; used for the slider warning. */
export function minimumMargin(
  totalCostEur: Cents,
  channel: Pick<Channel, 'feePercent' | 'feeFixed'>,
  salesPriceNetEur: Cents,
): Rate {
  assertCents(totalCostEur, 'Selbstkosten');
  assertCents(salesPriceNetEur, 'Verkaufspreis');
  if (salesPriceNetEur === 0) return 0;
  const fees = share(salesPriceNetEur, channel.feePercent) + channel.feeFixed;
  return (salesPriceNetEur - totalCostEur - fees) / salesPriceNetEur;
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
