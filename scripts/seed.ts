/**
 * Demo data from the screens, for local development and the preview database.
 * Usage: npm run db:seed (reads DATABASE_URL). Refuses to run if products exist,
 * so it can never mix demo data into real data.
 */

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

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL fehlt.');
  process.exit(1);
}
console.log(`Ziel: ${new URL(url).host}`);

const pool = new Pool({ connectionString: url });
const db = drizzle(pool, { schema });

try {
  if ((await db.query.products.findFirst({ columns: { id: true } })) !== undefined) {
    console.error('Es gibt schon Produkte. Demodaten werden nur in eine leere Datenbank geschrieben.');
    process.exitCode = 1;
  } else {
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
} finally {
  await pool.end();
}
