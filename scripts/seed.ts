/**
 * Demo data from the screens, for local development and the preview database.
 * Usage: npm run db:seed (reads DATABASE_URL).
 *
 * Two steps, each only where it cannot mix with real data:
 * 1. Products, only into a database without products.
 * 2. Demo sales (channels, one posted receipt, orders), only if there are no
 *    sales yet and the demo products exist.
 */

import { and, desc, eq, like, lte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../apps/web/server/db/schema.ts';
import { buildSku } from '../packages/core/src/sku.ts';

type DemoVariant = { color?: string; size?: string; price?: string };
type DemoProduct = { name: string; category: string; price: string; variants: DemoVariant[] };

const products: DemoProduct[] = [
  {
    name: 'Leinenkissen',
    category: 'KIS',
    price: '39.90',
    variants: [
      { color: 'SAN', size: '45×45' },
      { color: 'SAN', size: '50×50', price: '44.90' },
      { color: 'SAN', size: '60×60', price: '49.90' },
      { color: 'OLI', size: '45×45' },
    ],
  },
  {
    name: 'Tischläufer Leinen',
    category: 'TLF',
    price: '34.90',
    variants: [{ color: 'NAT', size: '40×150' }, { color: 'NAT', size: '40×200', price: '39.90' }],
  },
  {
    name: 'Wolldecke',
    category: 'DCK',
    price: '89.90',
    variants: [{ color: 'NAT', size: '130×170' }, { color: 'FEI', size: '130×170' }],
  },
  { name: 'Geschirrtuch-Set', category: 'GTS', price: '19.90', variants: [{ color: 'STR' }] },
  {
    name: 'Vase Terrakotta',
    category: 'VAS',
    price: '29.90',
    variants: [{ color: 'TER', size: 'Ø 20' }, { color: 'TER', size: 'Ø 30', price: '34.90' }],
  },
  { name: 'Duftkerze', category: 'KRZ', price: '14.90', variants: [{ color: 'NAT' }] },
  {
    name: 'Korb Seegras',
    category: 'DEC',
    price: '24.90',
    variants: [{ color: 'NAT', size: 'M' }, { color: 'NAT', size: 'L', price: '29.90' }],
  },
];

/** Placeholder fees and shipping until the real values are known (roadmap, open questions). */
const demoChannels = [
  { name: 'Shop', feePercent: '0.0290', feeFixed: '0.25', shippingPriceGross: '4.90', freeShippingFrom: '50.00', defaultPostage: '3.95' },
  { name: 'Etsy', feePercent: '0.1050', feeFixed: '0.30', shippingPriceGross: '4.90', freeShippingFrom: null, defaultPostage: '4.95' },
];

/** Variant key: product name, color code, size. */
type VariantRef = [product: string, color: string, size?: string];

const demoReceipt = {
  invoiceDate: '2026-10-01',
  freightEur: '40.00',
  positions: [
    { variant: ['Leinenkissen', 'SAN', '45×45'], quantity: 20, unitPriceEur: '9.00' },
    { variant: ['Tischläufer Leinen', 'NAT', '40×150'], quantity: 10, unitPriceEur: '8.00' },
    { variant: ['Duftkerze', 'NAT'], quantity: 30, unitPriceEur: '3.20' },
    // Less than sold below, so one order shows a shortfall.
    { variant: ['Geschirrtuch-Set', 'STR'], quantity: 3, unitPriceEur: '4.50' },
    { variant: ['Wolldecke', 'NAT', '130×170'], quantity: 5, unitPriceEur: '32.00' },
  ] satisfies { variant: VariantRef; quantity: number; unitPriceEur: string }[],
};

type DemoSale = {
  channel: string;
  number: string;
  date: string;
  country: string;
  status: 'open' | 'shipped';
  discount?: number;
  items: { variant: VariantRef; quantity: number; price: number }[];
};

/** Prices in cents. */
const demoSales: DemoSale[] = [
  { channel: 'Shop', number: '#1001', date: '2026-10-05', country: 'DE', status: 'shipped', items: [{ variant: ['Leinenkissen', 'SAN', '45×45'], quantity: 2, price: 3990 }] },
  { channel: 'Etsy', number: '3291', date: '2026-10-08', country: 'DE', status: 'shipped', items: [{ variant: ['Leinenkissen', 'SAN', '45×45'], quantity: 1, price: 3990 }] },
  {
    channel: 'Shop',
    number: '#1002',
    date: '2026-10-12',
    country: 'AT',
    status: 'shipped',
    discount: 500,
    items: [
      { variant: ['Tischläufer Leinen', 'NAT', '40×150'], quantity: 1, price: 3490 },
      { variant: ['Duftkerze', 'NAT'], quantity: 2, price: 1490 },
    ],
  },
  { channel: 'Etsy', number: '3318', date: '2026-10-20', country: 'DE', status: 'open', items: [{ variant: ['Geschirrtuch-Set', 'STR'], quantity: 5, price: 1990 }] },
  { channel: 'Shop', number: '#1003', date: '2026-10-24', country: 'NL', status: 'open', items: [{ variant: ['Wolldecke', 'NAT', '130×170'], quantity: 1, price: 8990 }] },
];

const toNumeric = (cents: number) => (cents / 100).toFixed(4);
const toCents = (numeric: string | null) => (numeric === null ? null : Math.round(Number(numeric) * 100));
const noon = (date: string) => new Date(`${date}T12:00:00Z`);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL fehlt.');
  process.exit(1);
}
console.log(`Ziel: ${new URL(url).host}`);

const pool = new Pool({ connectionString: url });
const db = drizzle(pool, { schema });
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function seedProducts(): Promise<void> {
  if ((await db.query.products.findFirst({ columns: { id: true } })) !== undefined) {
    console.log('Produkte vorhanden – Schritt 1 übersprungen.');
    return;
  }
  const categories = new Map((await db.query.categories.findMany()).map((c) => [c.code, c]));
  const colors = new Map((await db.query.colors.findMany()).map((c) => [c.code, c]));

  await db.transaction(async (tx) => {
    for (const demo of products) {
      const category = categories.get(demo.category);
      if (!category) throw new Error(`Kategorie ${demo.category} fehlt (Migration gelaufen?).`);

      const [product] = await tx
        .insert(schema.products)
        .values({ name: demo.name, categoryId: category.id, basePriceGross: demo.price })
        .returning({ id: schema.products.id, number: schema.products.number });
      if (!product) throw new Error(`${demo.name} konnte nicht angelegt werden.`);

      await tx.insert(schema.variants).values(
        demo.variants.map((v) => ({
          productId: product.id,
          colorId: v.color ? colors.get(v.color)?.id : null,
          size: v.size ?? null,
          priceGross: v.price ?? null,
          sku: buildSku({ categoryCode: demo.category, productNumber: product.number, colorCode: v.color, size: v.size }),
        })),
      );
    }

    const supplier = await tx.query.suppliers.findFirst({ where: (s, { eq }) => eq(s.name, 'Lino Tekstil') });
    if (!supplier) {
      await tx.insert(schema.suppliers).values({ name: 'Lino Tekstil', country: 'TR', defaultCurrency: 'TRY' });
    }
  });
  console.log(`${products.length} Produkte mit Varianten angelegt.`);
}

async function seedSales(): Promise<void> {
  if ((await db.query.sales.findFirst({ columns: { id: true } })) !== undefined) {
    console.log('Verkäufe vorhanden – Schritt 2 übersprungen.');
    return;
  }
  const variantRows = await db.query.variants.findMany({
    with: { color: { columns: { code: true } }, product: { columns: { name: true, vatCategory: true } } },
  });
  const findVariant = ([product, color, size]: VariantRef) =>
    variantRows.find((v) => v.product.name === product && v.color?.code === color && (v.size ?? undefined) === size);
  const missing = [...demoReceipt.positions.map((p) => p.variant), ...demoSales.flatMap((s) => s.items.map((i) => i.variant))].filter(
    (ref) => findVariant(ref) === undefined,
  );
  if (missing.length > 0) {
    console.log('Demo-Produkte fehlen – Schritt 2 übersprungen, damit keine Demo-Verkäufe in echte Daten geraten.');
    return;
  }

  await db.transaction(async (tx) => {
    const channels = new Map<string, typeof schema.channels.$inferSelect>();
    for (const demo of demoChannels) {
      const existing = await tx.query.channels.findFirst({ where: eq(schema.channels.name, demo.name) });
      const [channel] = existing ? [existing] : await tx.insert(schema.channels).values(demo).returning();
      if (!channel) throw new Error(`Kanal ${demo.name} konnte nicht angelegt werden.`);
      channels.set(demo.name, channel);
    }

    const remaining = await postDemoReceipt(tx, findVariant);

    for (const demo of demoSales) {
      const channel = channels.get(demo.channel);
      if (!channel) throw new Error(`Kanal ${demo.channel} fehlt.`);
      await postDemoSale(tx, demo, channel, findVariant, remaining);
    }
  });
  console.log(`1 Wareneingang und ${demoSales.length} Demo-Verkäufe angelegt.`);
}

/** Posts the demo receipt; returns the remaining quantity per variant for the FIFO issue below. */
async function postDemoReceipt(
  tx: Tx,
  findVariant: (ref: VariantRef) => { id: string } | undefined,
): Promise<Map<string, { batchId: string; remaining: number }>> {
  let supplier = await tx.query.suppliers.findFirst({ where: eq(schema.suppliers.name, 'Lino Tekstil') });
  if (!supplier) {
    [supplier] = await tx.insert(schema.suppliers).values({ name: 'Lino Tekstil', country: 'TR', defaultCurrency: 'TRY' }).returning();
  }
  if (!supplier) throw new Error('Lieferant konnte nicht angelegt werden.');

  const year = demoReceipt.invoiceDate.slice(0, 4);
  const last = await tx.query.goodsReceipts.findFirst({
    where: like(schema.goodsReceipts.number, `WE-${year}-%`),
    orderBy: [desc(schema.goodsReceipts.number)],
  });
  const sequence = last ? Number(last.number.slice(-3)) + 1 : 1;

  const [receipt] = await tx
    .insert(schema.goodsReceipts)
    .values({
      number: `WE-${year}-${String(sequence).padStart(3, '0')}`,
      supplierId: supplier.id,
      invoiceNumber: 'DEMO-1',
      invoiceDate: demoReceipt.invoiceDate,
      state: 'posted',
    })
    .returning({ id: schema.goodsReceipts.id });
  if (!receipt) throw new Error('Wareneingang konnte nicht angelegt werden.');

  await tx.insert(schema.additionalCosts).values({
    goodsReceiptId: receipt.id,
    kind: 'freight',
    amountEur: demoReceipt.freightEur,
    incurredOn: demoReceipt.invoiceDate,
  });

  const remaining = new Map<string, { batchId: string; remaining: number }>();
  for (const position of demoReceipt.positions) {
    const variant = findVariant(position.variant);
    if (!variant) throw new Error(`Variante ${position.variant.join(' ')} fehlt.`);
    const unitPriceForeign = Math.round(Number(position.unitPriceEur) * 100);
    const [batch] = await tx
      .insert(schema.batches)
      .values({
        goodsReceiptId: receipt.id,
        variantId: variant.id,
        quantityOrdered: position.quantity,
        unitPriceForeign,
        unitPriceEur: toNumeric(unitPriceForeign),
      })
      .returning({ id: schema.batches.id });
    if (!batch) throw new Error('Position konnte nicht angelegt werden.');

    const [entry] = await tx
      .insert(schema.stockEntries)
      .values({ variantId: variant.id, kind: 'goods_receipt', quantity: position.quantity, postedAt: noon(demoReceipt.invoiceDate) })
      .returning({ id: schema.stockEntries.id });
    if (!entry) throw new Error('Zugang konnte nicht gebucht werden.');
    await tx.insert(schema.batchAllocations).values({ stockEntryId: entry.id, batchId: batch.id, quantity: position.quantity });
    remaining.set(variant.id, { batchId: batch.id, remaining: position.quantity });
  }
  return remaining;
}

/** Same rules as the app: free shipping from the threshold, flat fee on goods − discount + shipping. */
async function postDemoSale(
  tx: Tx,
  demo: DemoSale,
  channel: typeof schema.channels.$inferSelect,
  findVariant: (ref: VariantRef) => { id: string; product: { vatCategory: 'standard' | 'reduced' } } | undefined,
  remaining: Map<string, { batchId: string; remaining: number }>,
): Promise<void> {
  const discount = demo.discount ?? 0;
  const goods = demo.items.reduce((sum, i) => sum + i.quantity * i.price, 0);
  const freeFrom = toCents(channel.freeShippingFrom);
  const shipping = freeFrom !== null && goods >= freeFrom ? 0 : (toCents(channel.shippingPriceGross) ?? 0);
  const fee = Math.round((goods - discount + shipping) * Number(channel.feePercent)) + (toCents(channel.feeFixed) ?? 0);

  const [sale] = await tx
    .insert(schema.sales)
    .values({
      channelId: channel.id,
      externalOrderNumber: demo.number,
      orderedAt: noon(demo.date),
      deliveryCountry: demo.country,
      shippingRevenueGross: toNumeric(shipping),
      postageCost: channel.defaultPostage,
      discountGross: toNumeric(discount),
      status: demo.status,
    })
    .returning({ id: schema.sales.id });
  if (!sale) throw new Error(`Verkauf ${demo.number} konnte nicht angelegt werden.`);

  for (const line of demo.items) {
    const variant = findVariant(line.variant);
    if (!variant) throw new Error(`Variante ${line.variant.join(' ')} fehlt.`);
    const [rate] = await tx
      .select({ rate: schema.vatRates.rate })
      .from(schema.vatRates)
      .where(
        and(
          eq(schema.vatRates.country, demo.country),
          eq(schema.vatRates.vatCategory, variant.product.vatCategory),
          lte(schema.vatRates.validFrom, demo.date),
        ),
      )
      .orderBy(desc(schema.vatRates.validFrom))
      .limit(1);
    if (!rate) throw new Error(`Kein MwSt-Satz für ${demo.country}.`);

    const [item] = await tx
      .insert(schema.saleItems)
      .values({ saleId: sale.id, variantId: variant.id, quantity: line.quantity, unitPriceGross: toNumeric(line.price), vatRate: rate.rate })
      .returning({ id: schema.saleItems.id });
    if (!item) throw new Error('Position konnte nicht angelegt werden.');

    const [entry] = await tx
      .insert(schema.stockEntries)
      .values({ variantId: variant.id, kind: 'sale', quantity: -line.quantity, postedAt: noon(demo.date), saleItemId: item.id })
      .returning({ id: schema.stockEntries.id });
    if (!entry) throw new Error('Abgang konnte nicht gebucht werden.');

    // One demo batch per variant; whatever it cannot cover becomes a shortfall.
    const stock = remaining.get(variant.id);
    const covered = Math.min(stock?.remaining ?? 0, line.quantity);
    const allocations = [
      ...(stock && covered > 0 ? [{ stockEntryId: entry.id, batchId: stock.batchId, quantity: -covered }] : []),
      ...(covered < line.quantity ? [{ stockEntryId: entry.id, batchId: null, quantity: covered - line.quantity }] : []),
    ];
    await tx.insert(schema.batchAllocations).values(allocations);
    if (stock) stock.remaining -= covered;
  }

  if (fee !== 0) {
    await tx.insert(schema.fees).values({ saleId: sale.id, kind: 'transaction', amount: toNumeric(fee), source: 'flat' });
  }
}

try {
  await seedProducts();
  await seedSales();
} finally {
  await pool.end();
}
