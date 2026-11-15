/**
 * Order import from Shopify (1b-2): new orders become sales, later refunds and
 * cancellations are booked on them. Every order is one transaction and
 * idempotent through the Shopify IDs, so a repeated run changes nothing.
 */

import { and, arrayOverlaps, eq, inArray, ne, sql } from 'drizzle-orm';
import { H3Error } from 'h3';
import {
  SalesError,
  ShopifyImportError,
  StockError,
  channelForSource,
  refundRows,
  saleFromShopifyOrder,
  shopifyLocalDate,
  type ShopifyOrder,
} from '@roslett/core';
import { schema, type useDb } from '../db/client.js';
import type { ShopifySyncResult } from '../../shared/types/api.js';
import { conflict } from './errors.js';
import { cancelSale, insertRefund, insertSale, lockSale, prepareSale } from './sale-booking.js';
import { shopifyGraphql } from './shopify.js';
import type { Tx } from './stock.js';

type Db = ReturnType<typeof useDb>;
type ChannelRow = typeof schema.channels.$inferSelect;

/** Orders updated shortly before the last run are fetched again; the import is idempotent. */
const OVERLAP_MS = 5 * 60_000;

interface Money {
  shopMoney: { amount: string };
}

interface OrderNode {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  sourceName: string | null;
  cancelledAt: string | null;
  taxesIncluded: boolean;
  currencyCode: string;
  displayFulfillmentStatus: string;
  shippingAddress: { countryCodeV2: string | null } | null;
  subtotalPriceSet: Money;
  totalShippingPriceSet: Money;
  lineItems: {
    nodes: { id: string; sku: string | null; quantity: number; variant: { id: string } | null; originalUnitPriceSet: Money }[];
  };
  refunds: {
    id: string;
    createdAt: string;
    note: string | null;
    totalRefundedSet: Money;
    refundLineItems: {
      nodes: { quantity: number; restockType: string; lineItem: { id: string }; subtotalSet: Money }[];
    };
  }[];
}

interface OrderPage {
  orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: OrderNode[] };
}

// Only the delivery country is read from the customer (C4).
const ORDERS_QUERY = `query Orders($after: String, $query: String) {
  orders(first: 50, after: $after, sortKey: UPDATED_AT, query: $query) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name createdAt updatedAt sourceName cancelledAt taxesIncluded currencyCode displayFulfillmentStatus
      shippingAddress { countryCodeV2 }
      subtotalPriceSet { shopMoney { amount } }
      totalShippingPriceSet { shopMoney { amount } }
      lineItems(first: 100) { nodes { id sku quantity variant { id } originalUnitPriceSet { shopMoney { amount } } } }
      refunds(first: 50) {
        id createdAt note
        totalRefundedSet { shopMoney { amount } }
        refundLineItems(first: 100) { nodes { quantity restockType lineItem { id } subtotalSet { shopMoney { amount } } } }
      }
    }
  }
}`;

function toOrder(node: OrderNode): ShopifyOrder {
  return {
    id: node.id,
    name: node.name,
    createdAt: node.createdAt,
    sourceName: node.sourceName,
    cancelledAt: node.cancelledAt,
    taxesIncluded: node.taxesIncluded,
    currencyCode: node.currencyCode,
    displayFulfillmentStatus: node.displayFulfillmentStatus,
    countryCode: node.shippingAddress?.countryCodeV2 ?? null,
    subtotal: node.subtotalPriceSet.shopMoney.amount,
    shipping: node.totalShippingPriceSet.shopMoney.amount,
    lines: node.lineItems.nodes.map((l) => ({
      id: l.id,
      variantId: l.variant?.id ?? null,
      sku: l.sku,
      quantity: l.quantity,
      unitPrice: l.originalUnitPriceSet.shopMoney.amount,
    })),
    refunds: node.refunds.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      note: r.note || null,
      total: r.totalRefundedSet.shopMoney.amount,
      lines: r.refundLineItems.nodes.map((l) => ({
        lineItemId: l.lineItem.id,
        quantity: l.quantity,
        restockType: l.restockType,
        subtotal: l.subtotalSet.shopMoney.amount,
      })),
    })),
  };
}

/** Orders updated since `since` (all accessible ones without), oldest change first. */
async function fetchOrders(since: Date | null): Promise<{ order: ShopifyOrder; updatedAt: Date }[]> {
  const result: { order: ShopifyOrder; updatedAt: Date }[] = [];
  const query = since ? `updated_at:>='${since.toISOString()}'` : null;
  let after: string | null = null;
  do {
    const page: OrderPage = await shopifyGraphql<OrderPage>(ORDERS_QUERY, { after, query });
    for (const node of page.orders.nodes) result.push({ order: toOrder(node), updatedAt: new Date(node.updatedAt) });
    after = page.orders.pageInfo.hasNextPage ? page.orders.pageInfo.endCursor : null;
  } while (after);
  return result;
}

type Outcome = 'created' | 'updated' | 'unchanged';

async function loadImported(tx: Tx, shopifyOrderId: string) {
  return tx.query.sales.findFirst({
    where: eq(schema.sales.shopifyOrderId, shopifyOrderId),
    with: { items: true, refunds: { columns: { shopifyRefundId: true } } },
  });
}

async function createSale(tx: Tx, order: ShopifyOrder, channels: readonly ChannelRow[], warnings: string[]): Promise<void> {
  const sale = saleFromShopifyOrder(order);
  const channelId = channelForSource(channels, order.sourceName);
  const channel = channels.find((c) => c.id === channelId) ?? null;
  if (channel === null) {
    warnings.push(`Quelle „${order.sourceName ?? 'ohne'}“ ist keinem Kanal zugeordnet; ohne Kanal, Gebühren und Porto gebucht.`);
  } else {
    const manual = await tx.query.sales.findFirst({
      where: and(eq(schema.sales.channelId, channel.id), eq(schema.sales.externalOrderNumber, sale.externalOrderNumber)),
      columns: { id: true },
    });
    if (manual) {
      throw new ShopifyImportError(
        `Die Bestellnummer ist für ${channel.name} schon von Hand erfasst. Der Abruf bucht sie deshalb nicht noch einmal; ` +
          'bleibt die Meldung stehen, ist der Verkauf trotzdem im Dashboard.',
      );
    }
  }
  if (sale.countryAssumed) warnings.push('Ohne Lieferadresse; Lieferland DE angenommen.');

  // G5: linked Shopify ID first, the SKU as fallback for variants linked later.
  const shopifyIds = sale.lines.flatMap((l) => (l.variantId ? [l.variantId] : []));
  const skus = sale.lines.flatMap((l) => (l.sku ? [l.sku.trim().toUpperCase()] : []));
  const [byId, bySku] = await Promise.all([
    shopifyIds.length === 0
      ? []
      : tx.query.variants.findMany({
          where: inArray(schema.variants.shopifyVariantId, shopifyIds),
          columns: { id: true, sku: true, shopifyVariantId: true, archivedAt: true },
        }),
    skus.length === 0
      ? []
      : tx.query.variants.findMany({
          where: inArray(sql`upper(${schema.variants.sku})`, skus),
          columns: { id: true, sku: true, archivedAt: true },
        }),
  ]);
  const items = sale.lines.map((line) => {
    const variant =
      byId.find((v) => v.shopifyVariantId === line.variantId) ??
      bySku.find((v) => v.sku.toUpperCase() === line.sku?.trim().toUpperCase());
    if (variant === undefined) {
      throw new ShopifyImportError(
        line.sku
          ? `Position ${line.sku} gehört zu keiner Variante im Dashboard. Gibt es die SKU in Shopify mit Tippfehler, ` +
              'korrigieren Sie sie dort; sonst legen Sie die Variante im Dashboard an. Danach erneut abrufen.'
          : 'Eine Position hat keine SKU – etwa eine Geschenkkarte, ein Trinkgeld oder ein frei eingegebener Artikel. ' +
              'Solche Bestellungen kann das Dashboard nicht buchen.',
      );
    }
    if (variant.archivedAt !== null) {
      throw new ShopifyImportError(
        `${variant.sku} ist im Dashboard archiviert. Holen Sie die Variante auf der Produktseite zurück („Zurückholen“) ` +
          'und rufen Sie erneut ab.',
      );
    }
    return { variantId: variant.id, quantity: line.quantity, unitPriceGross: line.unitPriceGross, shopifyLineItemId: line.lineItemId };
  });

  const prepared = await prepareSale(tx, {
    channel,
    externalOrderNumber: sale.externalOrderNumber,
    orderedAt: sale.orderedAt,
    deliveryCountry: sale.deliveryCountry,
    shippingRevenueGross: sale.shippingRevenueGross,
    discountGross: sale.discountGross,
    items,
    status: sale.status,
    shopifyOrderId: order.id,
  });
  const inserted = await insertSale(tx, prepared);
  warnings.push(...inserted.warnings);
}

async function importOrder(db: Db, order: ShopifyOrder, channels: readonly ChannelRow[], warnings: string[]): Promise<Outcome> {
  return db.transaction(async (tx) => {
    // Two runs at once must not book the same order twice.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${order.id}))`);
    const imported = saleFromShopifyOrder(order);

    let outcome: Outcome = 'unchanged';
    let sale = await loadImported(tx, order.id);
    if (sale !== undefined) {
      // Read again under the lock: a manual refund may have been booked meanwhile.
      await lockSale(tx, sale.id);
      sale = await loadImported(tx, order.id);
    }
    if (sale === undefined) {
      await createSale(tx, order, channels, warnings);
      sale = await loadImported(tx, order.id);
      if (sale === undefined) throw new Error('Importierter Verkauf fehlt.');
      outcome = 'created';
    }
    const changed = () => {
      if (outcome === 'unchanged') outcome = 'updated';
    };

    if (sale.status === 'cancelled') return outcome;

    // G7: the refund Shopify creates with the cancellation belongs to it.
    if (imported.cancelled && sale.refunds.length === 0) {
      await cancelSale(
        tx,
        { id: sale.id, externalOrderNumber: sale.externalOrderNumber, itemIds: sale.items.map((i) => i.id) },
        'Storno in Shopify',
      );
      changed();
      return outcome;
    }
    if (imported.cancelled) {
      warnings.push('Nach einer Erstattung storniert; als Erstattungen gebucht, nicht als Storno.');
    }

    const booked = new Set(sale.refunds.map((r) => r.shopifyRefundId));
    for (const refund of order.refunds) {
      if (booked.has(refund.id)) continue;
      for (const row of refundRows(refund)) {
        const item = row.lineItemId === null ? null : sale.items.find((i) => i.shopifyLineItemId === row.lineItemId);
        if (item === undefined) {
          throw new ShopifyImportError(
            'Eine Erstattung betrifft eine Position, die beim ersten Abruf nicht in der Bestellung war – die Bestellung wurde ' +
              'in Shopify nachträglich bearbeitet. Das kann das Dashboard nicht nachbuchen.',
          );
        }
        await insertRefund(tx, sale, item, {
          quantity: row.quantity,
          amountGross: row.amountGross,
          restocked: row.restocked,
          damaged: false,
          refundedAt: shopifyLocalDate(refund.createdAt),
          note: refund.note ?? `Erstattung in Shopify (${order.name})`,
          shopifyRefundId: refund.id,
        });
        changed();
      }
    }

    // G8: only forward; a manual "shipped" is never reset.
    if (imported.status === 'shipped' && sale.status === 'open') {
      await tx.update(schema.sales).set({ status: 'shipped' }).where(eq(schema.sales.id, sale.id));
      changed();
    }
    return outcome;
  });
}

function messageOf(error: unknown): string | null {
  if (error instanceof ShopifyImportError || error instanceof StockError || error instanceof SalesError) return error.message;
  if (error instanceof H3Error) return error.message;
  return null;
}

/** The nightly run looks back this far regardless of the cursor and catches anything missed. */
const NIGHTLY_WINDOW_MS = 48 * 60 * 60_000;

export type SyncTrigger = 'manual' | 'scheduled' | 'nightly';

/**
 * Imports everything changed since the last run. A failed order holds the
 * cursor back to its change time, so the next run tries it again.
 */
export async function syncShopifyOrders(db: Db, trigger: SyncTrigger): Promise<ShopifySyncResult> {
  const startedAt = new Date();
  const state = await db.query.shopifySync.findFirst();
  let since = state ? new Date(state.ordersSyncedTo.getTime() - OVERLAP_MS) : null;
  if (trigger === 'nightly' && since !== null) {
    since = new Date(Math.min(since.getTime(), startedAt.getTime() - NIGHTLY_WINDOW_MS));
  }
  const [orders, channels] = await Promise.all([fetchOrders(since), db.query.channels.findMany()]);

  const counts = { created: 0, updated: 0, unchanged: 0 };
  const warnings: ShopifySyncResult['warnings'] = [];
  const errors: ShopifySyncResult['errors'] = [];
  let heldBack: Date | null = null;
  for (const { order, updatedAt } of orders) {
    const orderWarnings: string[] = [];
    try {
      counts[await importOrder(db, order, channels, orderWarnings)] += 1;
      warnings.push(...orderWarnings.map((message) => ({ order: order.name, message })));
    } catch (error) {
      const message = messageOf(error);
      if (message === null) throw error;
      errors.push({ order: order.name, orderId: order.id, message });
      if (heldBack === null || updatedAt < heldBack) heldBack = updatedAt;
    }
  }

  const syncedTo = heldBack ?? startedAt;
  const result: ShopifySyncResult = { fetched: orders.length, ...counts, warnings, errors, syncedTo: syncedTo.toISOString() };
  const run = { ordersSyncedTo: syncedTo, updatedAt: new Date(), lastRunTrigger: trigger, lastRunResult: result };
  await db
    .insert(schema.shopifySync)
    .values({ id: 1, ...run })
    .onConflictDoUpdate({ target: schema.shopifySync.id, set: run });
  return result;
}

/** A Shopify source belongs to one channel only. */
export async function assertShopifySourcesFree(
  db: Pick<Db, 'select'>,
  sources: readonly string[],
  channelId: string | null,
): Promise<void> {
  if (sources.length === 0) return;
  const [taken] = await db
    .select({ name: schema.channels.name })
    .from(schema.channels)
    .where(
      and(
        arrayOverlaps(schema.channels.shopifySources, [...sources]),
        channelId === null ? undefined : ne(schema.channels.id, channelId),
      ),
    )
    .limit(1);
  if (taken) {
    throw conflict(`Eine dieser Shopify-Quellen gehört schon zum Kanal ${taken.name}.`, {
      shopifySources: 'Schon vergeben.',
    });
  }
}
