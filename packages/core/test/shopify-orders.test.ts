import { describe, expect, it } from 'vitest';
import {
  ShopifyImportError,
  channelForSource,
  refundRows,
  saleFromShopifyOrder,
  type ShopifyOrder,
  type ShopifyRefund,
} from '../src/shopify-orders';

const order = (extra: Partial<ShopifyOrder> = {}): ShopifyOrder => ({
  id: 'gid://shopify/Order/1',
  name: '#1001',
  createdAt: '2026-10-31T13:44:25Z',
  sourceName: 'web',
  cancelledAt: null,
  taxesIncluded: true,
  currencyCode: 'EUR',
  displayFulfillmentStatus: 'UNFULFILLED',
  countryCode: 'DE',
  subtotal: '74.8',
  shipping: '0.0',
  lines: [
    { id: 'gid://shopify/LineItem/1', variantId: 'gid://shopify/ProductVariant/1', sku: 'A', quantity: 1, unitPrice: '34.9' },
    { id: 'gid://shopify/LineItem/2', variantId: 'gid://shopify/ProductVariant/2', sku: 'B', quantity: 1, unitPrice: '39.9' },
  ],
  refunds: [],
  ...extra,
});

describe('saleFromShopifyOrder', () => {
  it('übernimmt Bestellnummer, Datum, Land und Positionen in Cent', () => {
    expect(saleFromShopifyOrder(order())).toEqual({
      externalOrderNumber: '#1001',
      orderedAt: '2026-10-31',
      deliveryCountry: 'DE',
      countryAssumed: false,
      shippingRevenueGross: 0,
      discountGross: 0,
      status: 'open',
      cancelled: false,
      lines: [
        { lineItemId: 'gid://shopify/LineItem/1', variantId: 'gid://shopify/ProductVariant/1', sku: 'A', quantity: 1, unitPriceGross: 3490 },
        { lineItemId: 'gid://shopify/LineItem/2', variantId: 'gid://shopify/ProductVariant/2', sku: 'B', quantity: 1, unitPriceGross: 3990 },
      ],
    });
  });

  it('rechnet den Rabatt aus Warenwert minus Zwischensumme und nimmt den Versand', () => {
    const sale = saleFromShopifyOrder(order({ subtotal: '67.32', shipping: '4.9' }));
    expect(sale.discountGross).toBe(748);
    expect(sale.shippingRevenueGross).toBe(490);
  });

  it('setzt „versendet“ nur bei FULFILLED (G8)', () => {
    expect(saleFromShopifyOrder(order({ displayFulfillmentStatus: 'FULFILLED' })).status).toBe('shipped');
    expect(saleFromShopifyOrder(order({ displayFulfillmentStatus: 'PARTIALLY_FULFILLED' })).status).toBe('open');
  });

  it('nimmt das Datum in deutscher Zeit', () => {
    expect(saleFromShopifyOrder(order({ createdAt: '2026-10-31T23:30:00Z' })).orderedAt).toBe('2026-11-01');
  });

  it('nimmt ohne Lieferadresse DE an und meldet das', () => {
    const sale = saleFromShopifyOrder(order({ countryCode: null }));
    expect(sale.deliveryCountry).toBe('DE');
    expect(sale.countryAssumed).toBe(true);
  });

  it('erkennt den Storno an cancelledAt (G7)', () => {
    expect(saleFromShopifyOrder(order({ cancelledAt: '2026-10-31T13:49:36Z' })).cancelled).toBe(true);
  });

  it('lehnt andere Währungen und Nettopreise ab', () => {
    expect(() => saleFromShopifyOrder(order({ currencyCode: 'USD' }))).toThrow(ShopifyImportError);
    expect(() => saleFromShopifyOrder(order({ taxesIncluded: false }))).toThrow(ShopifyImportError);
  });

  it('lehnt eine Bestellung ohne Positionen ab', () => {
    expect(() => saleFromShopifyOrder(order({ lines: [] }))).toThrow(ShopifyImportError);
  });
});

describe('refundRows', () => {
  const refund = (extra: Partial<ShopifyRefund> = {}): ShopifyRefund => ({
    id: 'gid://shopify/Refund/1',
    createdAt: '2026-10-31T13:47:55Z',
    note: null,
    total: '19.9',
    lines: [{ lineItemId: 'gid://shopify/LineItem/2', quantity: 1, restockType: 'CANCEL', subtotal: '19.9' }],
    ...extra,
  });

  it('bucht RETURN und CANCEL als wieder eingelagert (G10)', () => {
    expect(refundRows(refund())).toEqual([
      { lineItemId: 'gid://shopify/LineItem/2', quantity: 1, amountGross: 1990, restocked: true },
    ]);
    expect(refundRows(refund({ lines: [{ lineItemId: 'x', quantity: 1, restockType: 'RETURN', subtotal: '19.9' }] }))[0]?.restocked).toBe(true);
  });

  it('bucht NO_RESTOCK ohne Bestand', () => {
    const rows = refundRows(refund({ lines: [{ lineItemId: 'x', quantity: 1, restockType: 'NO_RESTOCK', subtotal: '19.9' }] }));
    expect(rows[0]?.restocked).toBe(false);
  });

  it('bucht den Rest über die Positionen hinaus auf die ganze Bestellung', () => {
    expect(refundRows(refund({ total: '24.8' }))).toEqual([
      { lineItemId: 'gid://shopify/LineItem/2', quantity: 1, amountGross: 1990, restocked: true },
      { lineItemId: null, quantity: 0, amountGross: 490, restocked: false },
    ]);
  });

  it('kürzt die Positionen anteilig, wenn weniger erstattet wurde', () => {
    const rows = refundRows(
      refund({
        total: '30.0',
        lines: [
          { lineItemId: 'a', quantity: 1, restockType: 'NO_RESTOCK', subtotal: '20.0' },
          { lineItemId: 'b', quantity: 1, restockType: 'NO_RESTOCK', subtotal: '20.0' },
        ],
      }),
    );
    expect(rows.map((r) => r.amountGross)).toEqual([1500, 1500]);
  });

  it('bucht eine reine Geld-Erstattung auf die ganze Bestellung', () => {
    expect(refundRows(refund({ total: '5.0', lines: [] }))).toEqual([
      { lineItemId: null, quantity: 0, amountGross: 500, restocked: false },
    ]);
  });

  it('ergibt nichts bei einer Erstattung über 0 €', () => {
    expect(refundRows(refund({ total: '0.0', lines: [] }))).toEqual([]);
  });
});

describe('channelForSource', () => {
  const channels = [
    { id: 'shop', shopifySources: ['web', 'shopify_draft_order'] },
    { id: 'etsy', shopifySources: ['1234567'] },
  ];

  it('findet den Kanal zur Shopify-Quelle', () => {
    expect(channelForSource(channels, 'shopify_draft_order')).toBe('shop');
    expect(channelForSource(channels, '1234567')).toBe('etsy');
  });

  it('gibt bei unbekannter oder fehlender Quelle null zurück', () => {
    expect(channelForSource(channels, 'pos')).toBeNull();
    expect(channelForSource(channels, null)).toBeNull();
  });
});
