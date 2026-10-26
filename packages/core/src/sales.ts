/**
 * Sales: channel defaults for shipping and flat fees, and the margin per sale
 * line. Order-level amounts are split by goods value; everything that enters
 * the margin is net.
 */

import type { Cents, Rate } from './money.js';
import { assertCents, distributeByWeight, round, share, sum } from './money.js';

export class SalesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SalesError';
  }
}

export interface SaleLine {
  readonly id: string;
  readonly quantity: number;
  readonly unitPriceGross: Cents;
  readonly vatRate: Rate;
  /** FIFO cost of the whole line; provisional while part of it is a shortfall. */
  readonly costOfGoodsEur: Cents;
  /** Cost items (packaging, labels …) per unit. */
  readonly unitCostItemsEur: Cents;
}

export interface SaleInput {
  readonly shippingRevenueGross: Cents;
  /** Postage and fees are net costs. */
  readonly postageCost: Cents;
  readonly discountGross: Cents;
  readonly feesEur: Cents;
  readonly lines: readonly SaleLine[];
}

export interface SaleFigures {
  readonly goodsGross: Cents;
  readonly revenueNetEur: Cents;
  readonly costOfGoodsEur: Cents;
  readonly costItemsEur: Cents;
  readonly feesEur: Cents;
  readonly postageEur: Cents;
  readonly shippingRevenueNetEur: Cents;
  readonly discountNetEur: Cents;
  readonly contributionMarginEur: Cents;
  /** Contribution / net revenue; 0 without revenue. */
  readonly margin: Rate;
}

export interface SaleLineMargin extends SaleFigures {
  readonly id: string;
}

export interface SaleMarginResult {
  readonly lines: readonly SaleLineMargin[];
  readonly totals: SaleFigures;
}

/** Shipping charged to the customer; free from the channel's threshold on. */
export function shippingRevenueFor(
  channel: { shippingPriceGross: Cents; freeShippingFrom: Cents | null },
  goodsGross: Cents,
): Cents {
  assertCents(goodsGross, 'Warenwert');
  if (channel.freeShippingFrom !== null && goodsGross >= channel.freeShippingFrom) return 0;
  return assertCents(channel.shippingPriceGross, 'Versandpreis');
}

function goodsGrossOf(line: SaleLine): Cents {
  return line.quantity * assertCents(line.unitPriceGross, 'Verkaufspreis');
}

/** Base of the flat fee: goods − discount + shipping, all gross. */
export function orderTotalGross(lines: readonly SaleLine[], discountGross: Cents, shippingRevenueGross: Cents): Cents {
  return sum(lines.map(goodsGrossOf)) - assertCents(discountGross, 'Rabatt') + assertCents(shippingRevenueGross, 'Versanderlös');
}

export function flatFee(channel: { feePercent: Rate; feeFixed: Cents }, orderTotal: Cents): Cents {
  return round(share(orderTotal, channel.feePercent)) + assertCents(channel.feeFixed, 'Fixgebühr');
}

function assertLine(line: SaleLine): void {
  if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
    throw new SalesError(`Menge muss eine positive ganze Zahl sein, erhalten: ${String(line.quantity)}`);
  }
  if (!Number.isFinite(line.vatRate) || line.vatRate < 0) {
    throw new SalesError(`Ungültiger MwSt-Satz: ${String(line.vatRate)}`);
  }
  assertCents(line.costOfGoodsEur, 'Wareneinsatz');
  assertCents(line.unitCostItemsEur, 'Stückkosten');
}

const toNet = (gross: Cents, vatRate: Rate): Cents => round(gross / (1 + vatRate));

const marginOf = (contribution: Cents, revenueNet: Cents): Rate => (revenueNet === 0 ? 0 : contribution / revenueNet);

/**
 * Margin per line = net revenue − FIFO cost − cost items − fees − postage
 * + net shipping revenue − net discount. Discount and shipping revenue are
 * netted with the VAT rate of the line they are distributed to.
 */
export function saleMargins(input: SaleInput): SaleMarginResult {
  if (input.lines.length === 0) throw new SalesError('Ein Verkauf braucht mindestens eine Position.');
  input.lines.forEach(assertLine);

  const weights = input.lines.map(goodsGrossOf);
  const discounts = distributeByWeight(assertCents(input.discountGross, 'Rabatt'), weights);
  const shipping = distributeByWeight(assertCents(input.shippingRevenueGross, 'Versanderlös'), weights);
  const postage = distributeByWeight(assertCents(input.postageCost, 'Porto'), weights);
  const fees = distributeByWeight(assertCents(input.feesEur, 'Gebühren'), weights);

  const lines = input.lines.map((line, i): SaleLineMargin => {
    const goodsGross = weights[i] ?? 0;
    const revenueNetEur = toNet(goodsGross, line.vatRate);
    const costItemsEur = line.quantity * line.unitCostItemsEur;
    const feesEur = fees[i] ?? 0;
    const postageEur = postage[i] ?? 0;
    const shippingRevenueNetEur = toNet(shipping[i] ?? 0, line.vatRate);
    const discountNetEur = toNet(discounts[i] ?? 0, line.vatRate);
    const contributionMarginEur =
      revenueNetEur - line.costOfGoodsEur - costItemsEur - feesEur - postageEur + shippingRevenueNetEur - discountNetEur;
    return {
      id: line.id,
      goodsGross,
      revenueNetEur,
      costOfGoodsEur: line.costOfGoodsEur,
      costItemsEur,
      feesEur,
      postageEur,
      shippingRevenueNetEur,
      discountNetEur,
      contributionMarginEur,
      margin: marginOf(contributionMarginEur, revenueNetEur),
    };
  });

  const total = (key: keyof Omit<SaleFigures, 'margin'>): Cents => sum(lines.map((l) => l[key]));
  const revenueNetEur = total('revenueNetEur');
  const contributionMarginEur = total('contributionMarginEur');
  return {
    lines,
    totals: {
      goodsGross: total('goodsGross'),
      revenueNetEur,
      costOfGoodsEur: total('costOfGoodsEur'),
      costItemsEur: total('costItemsEur'),
      feesEur: total('feesEur'),
      postageEur: total('postageEur'),
      shippingRevenueNetEur: total('shippingRevenueNetEur'),
      discountNetEur: total('discountNetEur'),
      contributionMarginEur,
      margin: marginOf(contributionMarginEur, revenueNetEur),
    },
  };
}
