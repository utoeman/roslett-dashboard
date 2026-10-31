/**
 * Go-live reset (G28): removes all products and everything booked on them in
 * one transaction. Master data (categories, colours, suppliers, channels, VAT
 * rates, manufacturer, general cost items) and the Shopify import cursor stay.
 * Product numbers restart at 1 so the real catalogue begins with 0001.
 *
 * Without `--apply` the transaction is rolled back after printing the counts
 * (dry run). Usage: DATABASE_URL=… node scripts/reset-test-data.ts [--apply]
 */

import pg from 'pg';

const apply = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL fehlt.');
  process.exit(1);
}

/** Delete order follows the foreign keys: dependants first. */
const STEPS: { label: string; table: string; where?: string }[] = [
  { label: 'Chargenzuordnungen', table: 'batch_allocations' },
  { label: 'Shopify-Bestandsvermerke', table: 'shopify_inventory_pushes' },
  { label: 'Bestandsbuchungen', table: 'stock_entries' },
  { label: 'Erstattungen', table: 'refunds' },
  { label: 'Gebühren', table: 'fees' },
  { label: 'Verkaufspositionen', table: 'sale_items' },
  { label: 'Verkäufe', table: 'sales' },
  { label: 'Nebenkosten', table: 'additional_costs' },
  { label: 'Chargen', table: 'batches' },
  { label: 'Wareneingänge', table: 'goods_receipts' },
  { label: 'Kanalpreise', table: 'channel_prices' },
  { label: 'Kostenpositionen einer Variante', table: 'cost_items', where: 'variant_id is not null' },
  { label: 'Varianten', table: 'variants' },
  { label: 'Produkte', table: 'products' },
];

/** Shown so the dry run proves what stays. */
const KEPT: { label: string; table: string; where?: string }[] = [
  { label: 'Kategorien', table: 'categories' },
  { label: 'Farben', table: 'colors' },
  { label: 'Lieferanten', table: 'suppliers' },
  { label: 'Kanäle', table: 'channels' },
  { label: 'MwSt-Sätze', table: 'vat_rates' },
  { label: 'Allgemeine Kostenpositionen', table: 'cost_items', where: 'variant_id is null' },
];

const client = new pg.Client({ connectionString: url });
await client.connect();

const count = async (table: string, where?: string): Promise<number> => {
  const result = await client.query<{ n: string }>(`select count(*) as n from ${table}${where ? ` where ${where}` : ''}`);
  return Number(result.rows[0]?.n ?? 0);
};

try {
  await client.query('begin');
  console.log(apply ? 'LÖSCHEN – wird gespeichert' : 'PROBELAUF – nichts wird gespeichert');
  console.log('');
  for (const step of STEPS) {
    const before = await count(step.table, step.where);
    await client.query(`delete from ${step.table}${step.where ? ` where ${step.where}` : ''}`);
    console.log(`gelöscht  ${String(before).padStart(6)}  ${step.label}`);
  }
  await client.query('alter table products alter column number restart with 1');
  console.log('Produktnummern beginnen wieder bei 0001.');
  console.log('');
  for (const kept of KEPT) {
    console.log(`bleibt    ${String(await count(kept.table, kept.where)).padStart(6)}  ${kept.label}`);
  }
  await client.query(apply ? 'commit' : 'rollback');
  console.log('');
  console.log(apply ? 'Gespeichert.' : 'Zurückgerollt – Datenbank unverändert.');
} catch (error) {
  await client.query('rollback');
  console.error('Fehler, alles zurückgerollt:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
