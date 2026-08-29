/**
 * Drizzle-Schema.
 *
 * Grundsaetze:
 * - Primaerschluessel sind UUIDs, erzeugt von der Datenbank.
 * - Geloescht wird nichts. Stattdessen setzt `archived_at` einen Zeitstempel.
 * - Geldbetraege liegen als NUMERIC(14,4) vor. Die vier Nachkommastellen
 *   nehmen Zwischenwerte auf, ohne dass gerundet werden muss; die Anwendung
 *   rechnet trotzdem durchgaengig in ganzzahligen Cent (Regel 1).
 * - Der Bestand ist kein Feld. Er ergibt sich aus dem Buchungsjournal (Regel 8).
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
// Gemeinsame Bausteine
// ---------------------------------------------------------------------------

/** Geldspalte. NUMERIC statt double precision, weil Fliesskomma bei Geld ausfaellt. */
const money = (name: string) => numeric(name, { precision: 14, scale: 4 });

const createdAt = timestamp('created_at', { withTimezone: true })
  .notNull()
  .defaultNow();

// ---------------------------------------------------------------------------
// Aufzaehlungen
// ---------------------------------------------------------------------------

export const costItemKindEnum = pgEnum('cost_item_kind', ['fix', 'percent']);

/** Verteilmethode fuer Nebenkosten einer Sendung (Regel 7). */
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

/**
 * Herkunft einer Buchung. Wird angelegt, aber in diesem Projekt nicht
 * verwendet; die Etsy-Anbindung ist ausdruecklich nicht Teil davon.
 */
export const stockEntrySourceEnum = pgEnum('stock_entry_source', [
  'manual',
  'etsy',
  'correction',
]);

// ---------------------------------------------------------------------------
// Stammdaten
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
 * Varianten.
 *
 * Auch ein Produkt ohne echte Varianten bekommt genau eine Standardvariante.
 * Das haelt jede nachgelagerte Abfrage frei von Sonderfaellen: Chargen,
 * Buchungen und Preise haengen ausnahmslos an einer Variante, nie an einem
 * Produkt.
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
    /** Umsatzsteuersatz zur Information. Beruehrt die Kalkulation nicht (Regel 2). */
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
  /**
   * Geloescht wird nicht. Ein Lieferant, mit dem nicht mehr gearbeitet wird,
   * bekommt hier einen Zeitstempel und verschwindet aus den Auswahllisten.
   * Seine Chargen bleiben unangetastet, sonst ginge die Historie verloren.
   */
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt,
});

// ---------------------------------------------------------------------------
// Wareneingang
// ---------------------------------------------------------------------------

/**
 * Chargen.
 *
 * Fremdwaehrung: Betrag, Waehrungscode und Wechselkurs werden gespeichert und
 * der Euro-Betrag daneben persistiert (Regel 6). Der Kurs friert beim
 * Wareneingang ein; zur Anzeigezeit wird nie umgerechnet, sonst wuerde sich
 * der Wareneinsatz vergangener Perioden mit jedem Kursstand aendern.
 *
 * `additional_costs_eur` und `landed_cost_eur` sind festgeschriebene
 * Ergebnisse der Verteilung, keine berechneten Felder (Regel 7).
 *
 * `quantity_remaining` ist die einzige Ausnahme von Regel 8: es ist kein
 * Bestandsfeld, sondern der FIFO-Zeiger dieser Charge. Der Bestand einer
 * Variante ergibt sich weiterhin allein aus dem Journal.
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
    /** ISO-4217-Code. Bei Einkauf in Euro schlicht "EUR" mit Kurs 1. */
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
    // Deckt die FIFO-Abfrage ab: Chargen einer Variante mit Restmenge,
    // aelteste zuerst.
    index('batches_fifo_idx').on(t.variantId, t.receivedAt),
  ],
);

// ---------------------------------------------------------------------------
// Kalkulation
// ---------------------------------------------------------------------------

/**
 * Kostenpositionen.
 *
 * `variant_id` null bedeutet: gilt global. `input_tax_deductible` steuert,
 * ob die Position in die Selbstkosten eingeht (Regel 3): Einfuhrumsatzsteuer
 * bleibt draussen, Zoll geht hinein.
 *
 * `distribution_method` ergaenzt das urspruengliche Datenmodell. Regel 7
 * verlangt, dass die Methode pro Kostenposition umschaltbar ist; ohne eigene
 * Spalte liesse sich diese Einstellung nicht speichern.
 */
export const costItems = pgTable(
  'cost_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    variantId: uuid('variant_id').references(() => variants.id),
    label: text('label').notNull(),
    kind: costItemKindEnum('kind').notNull(),
    /** Bei kind "fix" ein Betrag, bei "percent" eine Rate (0.1900 = 19 %). */
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
  /** Prozentuale Gebuehr auf den Verkaufspreis, 0.0650 = 6,5 %. */
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
    /** Ergebnis der Rueckwaertsrechnung (Regel 5). */
    suggestedPrice: money('suggested_price'),
    /** Was tatsaechlich im Shop steht. Weicht bewusst ab, wenn der Nutzer es so will. */
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
// Bestandsjournal
// ---------------------------------------------------------------------------

/**
 * Bestandsbuchungen. Das Journal ist die einzige Wahrheit ueber den Bestand
 * (Regel 8); `quantity` ist vorzeichenbehaftet, Abgaenge sind negativ.
 *
 * Storniert wird nicht durch Loeschen, sondern durch eine Gegenbuchung, die
 * ueber `reversed_by_id` auf das Original zeigt. So bleibt die Historie
 * vollstaendig nachvollziehbar.
 *
 * `source` und `external_reference` werden angelegt, aber in diesem Projekt
 * nicht verwendet. Die eindeutige Bedingung auf `external_reference`
 * verhindert spaeter doppelte Importe derselben Bestellung.
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
    // Partieller eindeutiger Index: mehrere Buchungen ohne externe Referenz
    // sind erlaubt, dieselbe Referenz zweimal aber nicht.
    uniqueIndex('stock_entries_external_reference_idx')
      .on(t.externalReference)
      .where(sql`${t.externalReference} is not null`),
  ],
);

/**
 * Chargenzuordnungen.
 *
 * Die FIFO-Zuordnung wird persistiert, nicht bei Bedarf neu berechnet
 * (Regel 9). Der Grund: eine Retoure muss exakt in die Charge zurueckbuchen,
 * aus der die Ware stammt. Wuerde man die Zuordnung nachtraeglich neu
 * herleiten, verschoebe jede spaetere Buchung das Ergebnis rueckwirkend.
 *
 * `landed_cost_eur` wird mitgeschrieben, obwohl er in der Charge steht: so
 * bleibt der Wareneinsatz des Vorgangs auch dann unveraendert, wenn die
 * Charge spaeter korrigiert wird.
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
// Beziehungen
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
