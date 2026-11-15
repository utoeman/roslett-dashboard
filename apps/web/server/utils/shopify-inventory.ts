/**
 * Stock changes to Shopify as relative adjustments: goods receipts (stage 2b,
 * G14, G16) and shrinkage, own use, stocktakes, supplier returns and reversals
 * of sent entries (stage 4). Every journal entry is sent once.
 */

import { createHash } from 'node:crypto';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import {
  PUSHED_KINDS,
  inventoryReason,
  overshootsDashboard,
  planInventoryPush,
  type InventoryChange,
  type PendingEntry,
  type PushedKind,
} from '@roslett/core';
import { schema, type useDb } from '../db/client.js';
import type {
  ReceiptShopifyPreview,
  ReceiptShopifyPushResult,
  ShopifyStockChangesPreview,
} from '../../shared/types/api.js';
import { badRequest, conflict } from './errors.js';
import { fetchShopifyVariants, shopifyGraphql } from './shopify.js';
import { currentStocks } from './stock.js';

type Db = ReturnType<typeof useDb>;
export type Reader = Pick<Db, 'select' | 'selectDistinct' | 'query'>;

interface Pending extends PendingEntry {
  kind: PushedKind;
  postedAt: Date;
}

const entryColumns = {
  entryId: schema.stockEntries.id,
  variantId: schema.stockEntries.variantId,
  quantity: schema.stockEntries.quantity,
  kind: schema.stockEntries.kind,
  postedAt: schema.stockEntries.postedAt,
};

const notSent = sql`not exists (select 1 from ${schema.shopifyInventoryPushes} p where p.stock_entry_id = ${schema.stockEntries.id})`;
const notReversed = sql`not exists (select 1 from ${schema.stockEntries} r where r.reverses_id = ${schema.stockEntries.id})`;
// A reversal goes to Shopify only if the entry it reverses went there.
const reversesSent = sql`exists (select 1 from ${schema.shopifyInventoryPushes} p where p.stock_entry_id = ${schema.stockEntries.reversesId} and p.reason = 'pushed')`;

const asPending = (rows: { entryId: string; variantId: string; quantity: number; kind: string; postedAt: Date }[]) =>
  rows.map((r) => ({ ...r, kind: r.kind as PushedKind }));

/** `goods_receipt` entries of one receipt that are neither reversed nor sent. */
async function pendingReceiptEntries(db: Reader, receiptId: string): Promise<Pending[]> {
  const rows = await db
    .selectDistinct(entryColumns)
    .from(schema.stockEntries)
    .innerJoin(schema.batchAllocations, eq(schema.batchAllocations.stockEntryId, schema.stockEntries.id))
    .innerJoin(schema.batches, eq(schema.batches.id, schema.batchAllocations.batchId))
    .where(
      and(eq(schema.batches.goodsReceiptId, receiptId), eq(schema.stockEntries.kind, 'goods_receipt'), notReversed, notSent),
    );
  return asPending(rows);
}

/** Every entry Shopify does not know about yet, oldest first (stage 4). */
async function pendingStockChanges(db: Reader): Promise<Pending[]> {
  const rows = await db
    .select(entryColumns)
    .from(schema.stockEntries)
    .where(
      and(
        notSent,
        or(
          and(inArray(schema.stockEntries.kind, [...PUSHED_KINDS]), notReversed),
          and(eq(schema.stockEntries.kind, 'reversal'), reversesSent),
        ),
      ),
    )
    .orderBy(schema.stockEntries.postedAt, schema.stockEntries.createdAt);
  return asPending(rows);
}

/** What goes to Shopify, the link per variant and the SKUs skipped for lack of one. */
async function planPush(db: Reader, entries: readonly Pending[]) {
  const variants = await db.query.variants.findMany({
    where: inArray(schema.variants.id, [...new Set(entries.map((e) => e.variantId))]),
    columns: { id: true, sku: true, shopifyInventoryItemId: true },
  });
  const linked = new Map(
    variants.flatMap((v) => (v.shopifyInventoryItemId ? [[v.id, { sku: v.sku, inventoryItemId: v.shopifyInventoryItemId }] as const] : [])),
  );
  const { changes, unlinkedVariantIds } = planInventoryPush(entries, linked);
  const skipped = new Set(unlinkedVariantIds);
  return { changes, linked, unlinked: variants.filter((v) => skipped.has(v.id)).map((v) => v.sku) };
}

type PushPlan = Awaited<ReturnType<typeof planPush>>;

/** Refuses before Shopify is asked anything when no variant is linked. */
async function planSendable(db: Reader, entries: readonly Pending[]): Promise<PushPlan> {
  const plan = await planPush(db, entries);
  if (plan.changes.length === 0) {
    throw badRequest(
      `Nicht mit Shopify verknüpft: ${plan.unlinked.join(', ')}. Bitte das Produkt erst nach Shopify übertragen oder verknüpfen.`,
    );
  }
  return plan;
}

/** Preview lines with the Shopify and dashboard stock and the double-count warning. */
async function previewLines(db: Reader, changes: readonly InventoryChange[], stock: ReadonlyMap<string, number>) {
  const dashboard = await currentStocks(db, changes.map((c) => c.variantId));
  return changes.map((c) => {
    const line = { sku: c.sku, delta: c.delta, shopifyStock: stock.get(c.inventoryItemId) ?? null, dashboardStock: dashboard.get(c.variantId) ?? 0 };
    return { variantId: c.variantId, line: { ...line, overshoots: overshootsDashboard(line) } };
  });
}

async function activeLocations(): Promise<{ id: string; name: string }[]> {
  const data = await shopifyGraphql<{ locations: { nodes: { id: string; name: string; isActive: boolean }[] } }>(
    `query { locations(first: 50) { nodes { id name isActive } } }`,
  );
  return data.locations.nodes.filter((l) => l.isActive).map(({ id, name }) => ({ id, name }));
}

/** G14: the only active location automatically, otherwise the chosen one. */
async function resolveLocation(locationId: string | null): Promise<{ id: string; name: string }> {
  const locations = await activeLocations();
  const location =
    locationId === null ? (locations.length === 1 ? locations[0] : undefined) : locations.find((l) => l.id === locationId);
  if (location === undefined) {
    throw badRequest(
      locationId === null ? 'Shopify hat mehrere Lagerorte; bitte einen wählen.' : 'Den Lagerort gibt es in Shopify nicht.',
      { locationId: 'Lagerort wählen.' },
    );
  }
  return location;
}

/** Current `available` quantity per inventory item at the location; items not stocked there are absent. */
async function availableAt(inventoryItemIds: readonly string[], locationId: string): Promise<Map<string, number>> {
  const data = await shopifyGraphql<{
    nodes: ({ id: string; inventoryLevel: { quantities: { quantity: number }[] } | null } | null)[];
  }>(
    `query Levels($ids: [ID!]!, $locationId: ID!) {
      nodes(ids: $ids) {
        ... on InventoryItem { id inventoryLevel(locationId: $locationId) { quantities(names: ["available"]) { quantity } } }
      }
    }`,
    { ids: [...inventoryItemIds], locationId },
  );
  const result = new Map<string, number>();
  for (const node of data.nodes) {
    const quantity = node?.inventoryLevel?.quantities[0]?.quantity;
    if (node && quantity !== undefined) result.set(node.id, quantity);
  }
  return result;
}

const idempotencyKey = (text: string) => `roslett-${createHash('sha256').update(text).digest('hex')}`;

/**
 * One relative adjustment of `available` at a location. `changeFromQuantity`
 * makes Shopify refuse when a quantity moved since it was read.
 */
async function adjustAvailable(input: {
  reason: string;
  referenceDocumentUri: string;
  key: string;
  locationId: string;
  changes: readonly { inventoryItemId: string; delta: number }[];
  available: ReadonlyMap<string, number>;
}): Promise<void> {
  const data = await shopifyGraphql<{ inventoryAdjustQuantities: { userErrors: { message: string }[] } }>(
    `mutation Adjust($input: InventoryAdjustQuantitiesInput!, $key: String!) {
      inventoryAdjustQuantities(input: $input) @idempotent(key: $key) { userErrors { message } }
    }`,
    {
      key: input.key,
      input: {
        reason: input.reason,
        name: 'available',
        referenceDocumentUri: input.referenceDocumentUri,
        changes: input.changes.map((c) => ({
          delta: c.delta,
          changeFromQuantity: input.available.get(c.inventoryItemId),
          inventoryItemId: c.inventoryItemId,
          locationId: input.locationId,
        })),
      },
    },
  );
  const errors = data.inventoryAdjustQuantities.userErrors;
  if (errors.length > 0) throw badRequest(`Shopify hat die Änderung abgelehnt: ${errors.map((e) => e.message).join('; ')}`);
}

/**
 * One adjustment per Shopify reason. Each claims its entries first (unique per
 * entry) and rolls the claim back if Shopify refuses; `changeFromQuantity`
 * makes Shopify refuse when the quantity moved since it was read, and the
 * idempotency key derived from the entries stops a retry from adding twice.
 */
async function pushEntries(
  db: Db,
  entries: readonly Pending[],
  { linked, unlinked }: PushPlan,
  location: { id: string; name: string },
  referenceDocumentUri: string,
): Promise<ReceiptShopifyPushResult> {
  const groups = new Map<string, Pending[]>();
  for (const entry of entries) {
    // Entries of unlinked variants get no push row and stay open.
    if (!linked.has(entry.variantId)) continue;
    const reason = inventoryReason(entry.kind);
    groups.set(reason, [...(groups.get(reason) ?? []), entry]);
  }

  const sent = new Map<string, number>();
  for (const [reason, group] of groups) {
    const { changes } = planInventoryPush(group, linked);
    const available = await availableAt(changes.map((c) => c.inventoryItemId), location.id);
    const missing = changes.find((c) => !available.has(c.inventoryItemId));
    if (missing) throw badRequest(`${missing.sku} wird am Lagerort ${location.name} nicht geführt.`);

    await db.transaction(async (tx) => {
      await tx
        .insert(schema.shopifyInventoryPushes)
        .values(group.map((e) => ({ stockEntryId: e.entryId, delta: e.quantity, locationId: location.id, reason: 'pushed' as const })));
      await adjustAvailable({
        reason,
        referenceDocumentUri,
        key: idempotencyKey(group.map((e) => e.entryId).sort().join(',')),
        locationId: location.id,
        changes,
        available,
      });
    });
    for (const c of changes) sent.set(c.sku, (sent.get(c.sku) ?? 0) + c.delta);
  }
  return { location: location.name, lines: [...sent].map(([sku, delta]) => ({ sku, delta })), unlinked };
}

async function shopifyStock(): Promise<Map<string, number>> {
  const shopify = await fetchShopifyVariants();
  return new Map(shopify.map((v) => [v.inventoryItemId, v.inventoryQuantity]));
}

// --- Goods receipts (2b) -------------------------------------------------------

async function requireReceipt(db: Reader, receiptId: string) {
  const receipt = await db.query.goodsReceipts.findFirst({
    where: eq(schema.goodsReceipts.id, receiptId),
    columns: { id: true, number: true, state: true },
  });
  if (receipt === undefined) throw badRequest('Den Wareneingang gibt es nicht.');
  if (receipt.state !== 'posted') throw conflict('Erst den Zugang buchen, dann nach Shopify übertragen.');
  return receipt;
}

export async function receiptShopifyPreview(db: Db, receiptId: string): Promise<ReceiptShopifyPreview> {
  await requireReceipt(db, receiptId);
  const entries = await pendingReceiptEntries(db, receiptId);
  if (entries.length === 0) return { lines: [], locations: [], unlinked: [] };
  const { changes, unlinked } = await planPush(db, entries);
  if (changes.length === 0) return { lines: [], locations: [], unlinked };
  const [stock, locations] = await Promise.all([shopifyStock(), activeLocations()]);
  return {
    lines: (await previewLines(db, changes, stock)).map(({ line }) => line),
    locations,
    unlinked,
  };
}

export async function pushReceiptToShopify(
  db: Db,
  receiptId: string,
  locationId: string | null,
): Promise<ReceiptShopifyPushResult> {
  const receipt = await requireReceipt(db, receiptId);
  const entries = await pendingReceiptEntries(db, receiptId);
  if (entries.length === 0) throw conflict('Dieser Zugang ist schon in Shopify.');
  const plan = await planSendable(db, entries);
  return pushEntries(db, entries, plan, await resolveLocation(locationId), `gid://roslett/GoodsReceipt/${receipt.number}`);
}

/** What Shopify gets back for one variant at one location, with the push rows it settles. */
export interface TakeBack {
  sku: string;
  inventoryItemId: string;
  locationId: string;
  /** Negative. */
  delta: number;
  pushIds: string[];
}

/**
 * Takes back at one location what a receipt about to be deleted sent to
 * Shopify (G32) – a push in reverse: the push rows go with the adjustment, so
 * the receipt counts as not sent from then on, whether or not the deletion
 * follows. A second attempt finds no rows and takes nothing back again; the key
 * derived from the rows covers the gap between Shopify's answer and the commit.
 */
export async function takeBackFromShopify(
  db: Db,
  receiptNumber: string,
  locationId: string,
  changes: readonly TakeBack[],
): Promise<{ sku: string; delta: number }[]> {
  const available = await availableAt(changes.map((c) => c.inventoryItemId), locationId);
  for (const c of changes) {
    const stock = available.get(c.inventoryItemId);
    if (stock === undefined) throw badRequest(`${c.sku} wird am Shopify-Lagerort nicht mehr geführt.`);
    if (stock + c.delta < 0) {
      throw conflict(
        `Shopify führt von ${c.sku} nur noch ${stock} Stück, abzuziehen wären ${-c.delta}. ` +
          'Dort ist vermutlich schon verkauft oder korrigiert worden; bitte erst klären.',
      );
    }
  }

  const pushIds = changes.flatMap((c) => c.pushIds);
  await db.transaction(async (tx) => {
    const released = await tx
      .delete(schema.shopifyInventoryPushes)
      .where(inArray(schema.shopifyInventoryPushes.id, pushIds))
      .returning({ id: schema.shopifyInventoryPushes.id });
    if (released.length !== pushIds.length) throw conflict('Der Wareneingang wurde inzwischen geändert. Bitte neu laden.');
    await adjustAvailable({
      reason: 'correction',
      referenceDocumentUri: `gid://roslett/GoodsReceipt/${receiptNumber}`,
      key: idempotencyKey(`delete:${[...pushIds].sort().join(',')}`),
      locationId,
      changes,
      available,
    });
  });
  return changes.map(({ sku, delta }) => ({ sku, delta }));
}

// --- All open stock changes (stage 4) ------------------------------------------

export async function stockChangesPreview(db: Db): Promise<ShopifyStockChangesPreview> {
  const entries = await pendingStockChanges(db);
  if (entries.length === 0) return { lines: [], locations: [], unlinked: [] };
  const { changes, unlinked } = await planPush(db, entries);
  if (changes.length === 0) return { lines: [], locations: [], unlinked };
  const [stock, locations] = await Promise.all([shopifyStock(), activeLocations()]);
  return {
    lines: (await previewLines(db, changes, stock)).map(({ variantId, line }) => ({
      ...line,
      entries: entries
        .filter((e) => e.variantId === variantId)
        .map((e) => ({ kind: e.kind, quantity: e.quantity, postedAt: e.postedAt.toISOString() })),
    })),
    locations,
    unlinked,
  };
}

export async function pushStockChanges(db: Db, locationId: string | null): Promise<ReceiptShopifyPushResult> {
  const entries = await pendingStockChanges(db);
  if (entries.length === 0) throw conflict('Es gibt keine offenen Bestandsänderungen.');
  const plan = await planSendable(db, entries);
  return pushEntries(db, entries, plan, await resolveLocation(locationId), 'gid://roslett/StockChanges/manual');
}
