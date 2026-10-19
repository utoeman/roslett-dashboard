/**
 * Drizzle schema.
 *
 * - Nothing is deleted; records are archived via `archived_at`.
 * - Money is NUMERIC(14,4), but the app computes in integer cents.
 * - Stock is not a column; it is derived from the stock journal.
 */

import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Shared columns
// ---------------------------------------------------------------------------

/** NUMERIC, never floating point, for money. */
const money = (name: string) => numeric(name, { precision: 14, scale: 4 });

const createdAt = timestamp('created_at', { withTimezone: true })
  .notNull()
  .defaultNow();

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const costItemKindEnum = pgEnum('cost_item_kind', ['fix', 'percent']);

/** How additional shipment costs are split across positions. */
export const distributionMethodEnum = pgEnum('distribution_method', [
  'value',
  'quantity',
]);

export const pricingRuleEnum = pgEnum('pricing_rule', ['same_margin', 'fixed']);

export const stockEntryKindEnum = pgEnum('stock_entry_kind', [
  'goods_receipt',
  'sale',
  'return',
  'correction',
  'stocktake',
  'shrinkage',
]);

/** Origin of a stock entry; prepared for the Etsy import. */
export const stockEntrySourceEnum = pgEnum('stock_entry_source', [
  'manual',
  'etsy',
  'correction',
]);

// ---------------------------------------------------------------------------
// Master data
// ---------------------------------------------------------------------------

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt,
});

/**
 * Every product has at least one (default) variant, so batches, entries and
 * prices always attach to a variant and never to a product.
 */
export const variants = pgTable(
  'variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    sku: text('sku').notNull(),
    label: text('label').notNull(),
    minimumStock: integer('minimum_stock').notNull().default(0),
    basePriceNet: money('base_price_net'),
    /** Informational only; calculation is net. */
    vatRate: numeric('vat_rate', { precision: 5, scale: 4 })
      .notNull()
      .default('0.1900'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt,
  },
  (t) => [
    uniqueIndex('variants_sku_idx').on(t.sku),
    index('variants_product_idx').on(t.productId),
  ],
);

export const suppliers = pgTable('suppliers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  country: text('country'),
  note: text('note'),
  /** Archived suppliers leave selection lists; their batches stay intact. */
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt,
});

// ---------------------------------------------------------------------------
// Goods receipt
// ---------------------------------------------------------------------------

/**
 * The exchange rate is frozen at receipt and the EUR amount stored, so past
 * cost of goods never changes with later rates.
 *
 * `quantity_remaining` is the FIFO pointer of this batch, not a stock field.
 */
export const batches = pgTable(
  'batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => variants.id),
    supplierId: uuid('supplier_id').references(() => suppliers.id),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    quantityReceived: integer('quantity_received').notNull(),
    quantityRemaining: integer('quantity_remaining').notNull(),
    purchasePriceForeign: money('purchase_price_foreign').notNull(),
    /** ISO 4217; "EUR" with rate 1 for euro purchases. */
    currency: text('currency').notNull().default('EUR'),
    exchangeRate: numeric('exchange_rate', { precision: 14, scale: 6 })
      .notNull()
      .default('1.000000'),
    purchasePriceEur: money('purchase_price_eur').notNull(),
    additionalCostsEur: money('additional_costs_eur').notNull().default('0'),
    landedCostEur: money('landed_cost_eur').notNull(),
    note: text('note'),
  },
  (t) => [
    // FIFO lookup: batches of a variant, oldest first.
    index('batches_fifo_idx').on(t.variantId, t.receivedAt),
  ],
);

// ---------------------------------------------------------------------------
// Costing
// ---------------------------------------------------------------------------

/**
 * `variant_id` null means global. Items with deductible input tax (import VAT)
 * stay out of the cost price; customs duty goes in.
 */
export const costItems = pgTable(
  'cost_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    variantId: uuid('variant_id').references(() => variants.id),
    label: text('label').notNull(),
    kind: costItemKindEnum('kind').notNull(),
    /** Amount for "fix", rate for "percent" (0.1900 = 19 %). */
    value: money('value').notNull(),
    inputTaxDeductible: boolean('input_tax_deductible').notNull().default(false),
    active: boolean('active').notNull().default(true),
    distributionMethod: distributionMethodEnum('distribution_method')
      .notNull()
      .default('value'),
  },
  (t) => [index('cost_items_variant_idx').on(t.variantId)],
);

export const channels = pgTable('channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  /** Fee as a rate of the sales price, 0.0650 = 6.5 %. */
  feePercent: numeric('fee_percent', { precision: 6, scale: 4 })
    .notNull()
    .default('0'),
  feeFixed: money('fee_fixed').notNull().default('0'),
  pricingRule: pricingRuleEnum('pricing_rule').notNull().default('same_margin'),
  active: boolean('active').notNull().default(true),
});

export const channelPrices = pgTable(
  'channel_prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => variants.id),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id),
    suggestedPrice: money('suggested_price'),
    /** The price actually listed; may deliberately differ from the suggestion. */
    listedPrice: money('listed_price'),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('channel_prices_variant_channel_idx').on(t.variantId, t.channelId),
  ],
);

// ---------------------------------------------------------------------------
// Stock journal
// ---------------------------------------------------------------------------

/**
 * The journal is the single source of truth for stock; outgoing quantities
 * are negative. Entries are reversed by a counter entry (`reversed_by_id`),
 * never deleted. The unique `external_reference` prevents duplicate imports.
 */
export const stockEntries = pgTable(
  'stock_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => variants.id),
    kind: stockEntryKindEnum('kind').notNull(),
    quantity: integer('quantity').notNull(),
    postedAt: timestamp('posted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    note: text('note'),
    source: stockEntrySourceEnum('source').notNull().default('manual'),
    externalReference: text('external_reference'),
    reversedById: uuid('reversed_by_id'),
  },
  (t) => [
    index('stock_entries_variant_idx').on(t.variantId, t.postedAt),
    // Partial: many entries without a reference, but each reference only once.
    uniqueIndex('stock_entries_external_reference_idx')
      .on(t.externalReference)
      .where(sql`${t.externalReference} is not null`),
  ],
);

/**
 * FIFO allocations are persisted, not recomputed, so a return goes back to
 * the exact batch it came from. `landed_cost_eur` is copied so the cost of
 * the transaction survives later batch corrections.
 */
export const batchAllocations = pgTable(
  'batch_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stockEntryId: uuid('stock_entry_id')
      .notNull()
      .references(() => stockEntries.id),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => batches.id),
    quantity: integer('quantity').notNull(),
    landedCostEur: money('landed_cost_eur').notNull(),
  },
  (t) => [
    index('batch_allocations_stock_entry_idx').on(t.stockEntryId),
    index('batch_allocations_batch_idx').on(t.batchId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const productsRelations = relations(products, ({ many }) => ({
  variants: many(variants),
}));

export const variantsRelations = relations(variants, ({ one, many }) => ({
  product: one(products, {
    fields: [variants.productId],
    references: [products.id],
  }),
  batches: many(batches),
  stockEntries: many(stockEntries),
  costItems: many(costItems),
  channelPrices: many(channelPrices),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  batches: many(batches),
}));

export const batchesRelations = relations(batches, ({ one, many }) => ({
  variant: one(variants, {
    fields: [batches.variantId],
    references: [variants.id],
  }),
  supplier: one(suppliers, {
    fields: [batches.supplierId],
    references: [suppliers.id],
  }),
  allocations: many(batchAllocations),
}));

export const channelsRelations = relations(channels, ({ many }) => ({
  channelPrices: many(channelPrices),
}));

export const channelPricesRelations = relations(channelPrices, ({ one }) => ({
  variant: one(variants, {
    fields: [channelPrices.variantId],
    references: [variants.id],
  }),
  channel: one(channels, {
    fields: [channelPrices.channelId],
    references: [channels.id],
  }),
}));

export const costItemsRelations = relations(costItems, ({ one }) => ({
  variant: one(variants, {
    fields: [costItems.variantId],
    references: [variants.id],
  }),
}));

export const stockEntriesRelations = relations(
  stockEntries,
  ({ one, many }) => ({
    variant: one(variants, {
      fields: [stockEntries.variantId],
      references: [variants.id],
    }),
    reversedBy: one(stockEntries, {
      fields: [stockEntries.reversedById],
      references: [stockEntries.id],
      relationName: 'reversal',
    }),
    allocations: many(batchAllocations),
  }),
);

export const batchAllocationsRelations = relations(
  batchAllocations,
  ({ one }) => ({
    stockEntry: one(stockEntries, {
      fields: [batchAllocations.stockEntryId],
      references: [stockEntries.id],
    }),
    batch: one(batches, {
      fields: [batchAllocations.batchId],
      references: [batches.id],
    }),
  }),
);
