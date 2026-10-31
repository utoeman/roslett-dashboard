/**
 * Goods receipts and productions to Shopify (stage 2b, G14, G16): booked
 * receipt entries not sent yet become one relative change per variant.
 */

import { createHash } from 'node:crypto';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { InventoryPushError, planInventoryPush, type InventoryChange, type PendingEntry } from '@roslett/core';
import { schema, type useDb } from '../db/client.js';
import type { ReceiptShopifyPreview, ReceiptShopifyPushResult } from '../../shared/types/api.js';
import { badRequest, conflict } from './errors.js';
import { fetchShopifyVariants, shopifyGraphql } from './shopify.js';

type Db = ReturnType<typeof useDb>;
type Reader = Pick<Db, 'select' | 'selectDistinct' | 'query'>;

/** `goods_receipt` entries of the receipt that are neither reversed nor sent. */
async function pendingEntries(db: Reader, receiptId: string): Promise<PendingEntry[]> {
  const reversed = sql`exists (select 1 from ${schema.stockEntries} r where r.reverses_id = ${schema.stockEntries.id})`;
  const pushed = sql`exists (select 1 from ${schema.shopifyInventoryPushes} p where p.stock_entry_id = ${schema.stockEntries.id})`;
  return db
    .selectDistinct({ entryId: schema.stockEntries.id, variantId: schema.stockEntries.variantId, quantity: schema.stockEntries.quantity })
    .from(schema.stockEntries)
    .innerJoin(schema.batchAllocations, eq(schema.batchAllocations.stockEntryId, schema.stockEntries.id))
    .innerJoin(schema.batches, eq(schema.batches.id, schema.batchAllocations.batchId))
    .where(
      and(
        eq(schema.batches.goodsReceiptId, receiptId),
        eq(schema.stockEntries.kind, 'goods_receipt'),
        sql`not ${reversed}`,
        sql`not ${pushed}`,
      ),
    );
}

async function plan(db: Reader, receiptId: string): Promise<{ entries: PendingEntry[]; changes: InventoryChange[] }> {
  const entries = await pendingEntries(db, receiptId);
  if (entries.length === 0) return { entries, changes: [] };
  const variants = await db.query.variants.findMany({
    where: and(
      inArray(schema.variants.id, [...new Set(entries.map((e) => e.variantId))]),
      isNotNull(schema.variants.shopifyInventoryItemId),
    ),
    columns: { id: true, sku: true, shopifyInventoryItemId: true },
  });
  const linked = new Map(variants.map((v) => [v.id, { sku: v.sku, inventoryItemId: v.shopifyInventoryItemId ?? '' }]));
  try {
    return { entries, changes: planInventoryPush(entries, linked) };
  } catch (error) {
    if (error instanceof InventoryPushError) throw badRequest(error.message);
    throw error;
  }
}

async function activeLocations(): Promise<{ id: string; name: string }[]> {
  const data = await shopifyGraphql<{ locations: { nodes: { id: string; name: string; isActive: boolean }[] } }>(
    `query { locations(first: 50) { nodes { id name isActive } } }`,
  );
  return data.locations.nodes.filter((l) => l.isActive).map(({ id, name }) => ({ id, name }));
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
  const { changes } = await plan(db, receiptId);
  if (changes.length === 0) return { lines: [], locations: [] };
  const [shopify, locations] = await Promise.all([fetchShopifyVariants(), activeLocations()]);
  const stock = new Map(shopify.map((v) => [v.inventoryItemId, v.inventoryQuantity]));
  return {
    lines: changes.map((c) => ({ sku: c.sku, delta: c.delta, shopifyStock: stock.get(c.inventoryItemId) ?? null })),
    locations,
  };
}

/**
 * Claims the entries first (unique per entry), then adjusts Shopify; if Shopify
 * fails, the transaction rolls the claim back. The idempotency key is derived
 * from the entries, so a retry after a lost answer cannot add twice.
 */
export async function pushReceiptToShopify(
  db: Db,
  receiptId: string,
  locationId: string | null,
): Promise<ReceiptShopifyPushResult> {
  const receipt = await requireReceipt(db, receiptId);
  const { entries, changes } = await plan(db, receiptId);
  if (changes.length === 0) throw conflict('Dieser Zugang ist schon in Shopify.');

  const locations = await activeLocations();
  const location =
    locationId === null ? (locations.length === 1 ? locations[0] : undefined) : locations.find((l) => l.id === locationId);
  if (location === undefined) {
    throw badRequest(
      locationId === null ? 'Shopify hat mehrere Lagerorte; bitte einen wählen.' : 'Den Lagerort gibt es in Shopify nicht.',
      { locationId: 'Lagerort wählen.' },
    );
  }

  const available = await availableAt(changes.map((c) => c.inventoryItemId), location.id);
  const missing = changes.find((c) => !available.has(c.inventoryItemId));
  if (missing) throw badRequest(`${missing.sku} wird am Lagerort ${location.name} nicht geführt.`);

  const key = createHash('sha256')
    .update(entries.map((e) => e.entryId).sort().join(','))
    .digest('hex');
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.shopifyInventoryPushes)
      .values(entries.map((e) => ({ stockEntryId: e.entryId, delta: e.quantity, locationId: location.id })));
    const data = await shopifyGraphql<{ inventoryAdjustQuantities: { userErrors: { message: string }[] } }>(
      `mutation Receive($input: InventoryAdjustQuantitiesInput!, $key: String!) {
        inventoryAdjustQuantities(input: $input) @idempotent(key: $key) { userErrors { message } }
      }`,
      {
        key: `roslett-${key}`,
        input: {
          reason: 'received',
          name: 'available',
          referenceDocumentUri: `gid://roslett/GoodsReceipt/${receipt.number}`,
          // Compare-and-set: Shopify refuses if the quantity moved since it was read.
          changes: changes.map((c) => ({
            delta: c.delta,
            changeFromQuantity: available.get(c.inventoryItemId),
            inventoryItemId: c.inventoryItemId,
            locationId: location.id,
          })),
        },
      },
    );
    const errors = data.inventoryAdjustQuantities.userErrors;
    if (errors.length > 0) throw badRequest(`Shopify hat den Zugang abgelehnt: ${errors.map((e) => e.message).join('; ')}`);
  });

  return { location: location.name, lines: changes.map((c) => ({ sku: c.sku, delta: c.delta })) };
}
