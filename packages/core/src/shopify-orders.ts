/**
 * Translates Shopify orders and refunds into dashboard sales input. Amounts
 * arrive as decimal strings in shop currency; only EUR with tax-inclusive
 * prices is supported.
 */

import type { Cents } from './money.js';
import { distributeByWeight, sum } from './money.js';

export class ShopifyImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShopifyImportError';
  }
}

export interface ShopifyOrderLine {
  id: string;
  variantId: string | null;
  sku: string | null;
  quantity: number;
  unitPrice: string;
}

export interface ShopifyRefundLine {
  lineItemId: string;
  quantity: number;
  restockType: string;
  subtotal: string;
}

export interface ShopifyRefund {
  id: string;
  createdAt: string;
  note: string | null;
  total: string;
  lines: ShopifyRefundLine[];
}

export interface ShopifyOrder {
  id: string;
  name: string;
  createdAt: string;
  sourceName: string | null;
  cancelledAt: string | null;
  taxesIncluded: boolean;
  currencyCode: string;
  displayFulfillmentStatus: string;
  /** Shipping address country; nothing else of the customer is read (C4). */
  countryCode: string | null;
  /** Line items after discounts, before shipping. */
  subtotal: string;
  shipping: string;
  lines: ShopifyOrderLine[];
  refunds: ShopifyRefund[];
}

export interface ImportedSaleLine {
  lineItemId: string;
  variantId: string | null;
  sku: string | null;
  quantity: number;
  unitPriceGross: Cents;
}

export interface ImportedSale {
  externalOrderNumber: string;
  orderedAt: string;
  deliveryCountry: string;
  /** No shipping address: DE like a manual entry, reported as a warning. */
  countryAssumed: boolean;
  shippingRevenueGross: Cents;
  discountGross: Cents;
  status: 'open' | 'shipped';
  cancelled: boolean;
  lines: ImportedSaleLine[];
}

export interface ImportedRefundRow {
  /** Null for the part on the whole order (shipping, goodwill). */
  lineItemId: string | null;
  quantity: number;
  amountGross: Cents;
  restocked: boolean;
}

/** G10: goods refunded with these restock types are back in stock. */
const RESTOCKED = new Set(['RETURN', 'CANCEL', 'LEGACY_RESTOCK']);

export function shopifyAmountToCents(amount: string): Cents {
  const value = Number(amount);
  if (!Number.isFinite(value)) throw new ShopifyImportError(`Ungültiger Betrag aus Shopify: ${amount}`);
  return Math.round(value * 100);
}

const berlinDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' });

/** ISO date in German time; Shopify timestamps are UTC. */
export function shopifyLocalDate(timestamp: string): string {
  return berlinDate.format(new Date(timestamp));
}

export function saleFromShopifyOrder(order: ShopifyOrder): ImportedSale {
  if (order.currencyCode !== 'EUR') {
    throw new ShopifyImportError(`${order.name}: Währung ${order.currencyCode} wird nicht unterstützt.`);
  }
  if (!order.taxesIncluded) {
    throw new ShopifyImportError(`${order.name}: Preise ohne MwSt werden nicht unterstützt.`);
  }
  if (order.lines.length === 0) throw new ShopifyImportError(`${order.name}: Die Bestellung hat keine Positionen.`);

  const lines = order.lines.map((line) => ({
    lineItemId: line.id,
    variantId: line.variantId,
    sku: line.sku,
    quantity: line.quantity,
    unitPriceGross: shopifyAmountToCents(line.unitPrice),
  }));
  const goodsGross = sum(lines.map((l) => l.quantity * l.unitPriceGross));

  return {
    externalOrderNumber: order.name,
    orderedAt: shopifyLocalDate(order.createdAt),
    deliveryCountry: order.countryCode ?? 'DE',
    countryAssumed: order.countryCode === null,
    shippingRevenueGross: shopifyAmountToCents(order.shipping),
    // Line and order discounts together; the subtotal already has both applied.
    discountGross: Math.max(0, goodsGross - shopifyAmountToCents(order.subtotal)),
    status: order.displayFulfillmentStatus === 'FULFILLED' ? 'shipped' : 'open',
    cancelled: order.cancelledAt !== null,
    lines,
  };
}

/**
 * Line rows carry their subtotal; whatever the refund total adds on top
 * (shipping, goodwill) goes onto the whole order. If less was refunded than the
 * lines say, the lines are cut down pro rata.
 */
export function refundRows(refund: ShopifyRefund): ImportedRefundRow[] {
  const total = shopifyAmountToCents(refund.total);
  const subtotals = refund.lines.map((l) => shopifyAmountToCents(l.subtotal));
  const onLines = Math.min(total, sum(subtotals));
  const amounts = refund.lines.length === 0 ? [] : distributeByWeight(onLines, subtotals);

  const rows: ImportedRefundRow[] = refund.lines.map((line, i) => ({
    lineItemId: line.lineItemId,
    quantity: line.quantity,
    amountGross: amounts[i] ?? 0,
    restocked: RESTOCKED.has(line.restockType),
  }));
  if (total > onLines) rows.push({ lineItemId: null, quantity: 0, amountGross: total - onLines, restocked: false });
  return rows;
}

export function channelForSource(
  channels: readonly { id: string; shopifySources: readonly string[] }[],
  sourceName: string | null,
): string | null {
  if (sourceName === null) return null;
  return channels.find((c) => c.shopifySources.includes(sourceName))?.id ?? null;
}
