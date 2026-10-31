/**
 * Products to Shopify via `productSet` (stage 3a). The dashboard owns title,
 * description, options, variants, SKU, price and the textile/GPSR metafields;
 * photos, SEO, collections and publishing stay in Shopify (field ownership).
 * `productSet` replaces the variant list, so variants missing here are removed.
 */

import { centsToEuros, type Cents } from './money.js';

export interface Manufacturer {
  name: string;
  address: string;
  email: string;
}

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/** Name plus product number, so equal names never collide. */
export function productHandle(name: string, number: number): string {
  const slug = name
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUTS[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug}-${String(number).padStart(4, '0')}`;
}

export const textToHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

/** The common value of all variants, or null plus a flag when they differ. */
export function commonValue(values: readonly (string | null)[]): { value: string | null; differs: boolean } {
  const distinct = new Set(values);
  return distinct.size === 1 ? { value: values[0] ?? null, differs: false } : { value: null, differs: true };
}

export class ProductPushError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductPushError';
  }
}

export interface ProductPushVariant {
  sku: string;
  colorName: string | null;
  size: string | null;
  /** Gross price, the product's base price already applied. */
  priceGross: Cents | null;
  fiber: string | null;
  fiberFilling: string | null;
  hsCode: string | null;
  originCountry: string | null;
  shopifyVariantId: string | null;
}

export interface ProductPushProduct {
  number: number;
  name: string;
  description: string | null;
  categoryName: string;
  textile: boolean;
  careNotes: string | null;
  safetyNotes: string | null;
  archived: boolean;
  shopifyProductId: string | null;
  /** Active variants only. */
  variants: ProductPushVariant[];
}

export interface MetafieldInput {
  namespace: string;
  key: string;
  type: string;
  value: string;
}

export interface VariantSetInput {
  id?: string;
  sku: string;
  price: string;
  taxable: boolean;
  optionValues: { optionName: string; name: string }[];
  /** HS code and origin always sent: null clears a value removed in the dashboard. */
  inventoryItem: { tracked: boolean; requiresShipping: boolean; harmonizedSystemCode: string | null; countryCodeOfOrigin: string | null };
  metafields: MetafieldInput[];
}

export type ProductStatus = 'ACTIVE' | 'ARCHIVED' | 'DRAFT';

export interface ProductSetInput {
  id?: string;
  /** Only on create: changing it later breaks shop URLs. */
  handle?: string;
  title: string;
  descriptionHtml: string;
  /** Manufacturer name; absent without manufacturer data, so Shopify keeps its vendor. */
  vendor?: string | undefined;
  productType: string;
  /** Draft on create, archived for archived products; otherwise publishing stays in Shopify. */
  status?: ProductStatus | undefined;
  productOptions: { name: string; values: { name: string }[] }[];
  metafields: MetafieldInput[];
  variants: VariantSetInput[];
}

const text = (key: string, value: string): MetafieldInput => ({ namespace: 'custom', key, type: 'multi_line_text_field', value });

export function buildProductSet(
  product: ProductPushProduct,
  manufacturer: Manufacturer | null,
): { input: ProductSetInput; warnings: string[] } {
  if (product.variants.length === 0) throw new ProductPushError(`${product.name}: keine aktiven Varianten.`);
  const unpriced = product.variants.find((v) => v.priceGross === null);
  if (unpriced) throw new ProductPushError(`${unpriced.sku}: kein Preis – Shopify würde 0,00 € setzen.`);

  const warnings: string[] = [];
  if (manufacturer === null) warnings.push('Herstellerangaben fehlen (Einstellungen → Hersteller).');
  const fiber = commonValue(product.variants.map((v) => v.fiber));
  const filling = commonValue(product.variants.map((v) => v.fiberFilling));
  if (fiber.differs) warnings.push('Faser je Variante unterschiedlich – nur an den Varianten gesetzt.');
  else if (product.textile && fiber.value === null) warnings.push('Faserangabe fehlt.');
  if (filling.differs) warnings.push('Faser Füllung je Variante unterschiedlich – nur an den Varianten gesetzt.');

  const options: { name: string; value: (v: ProductPushVariant) => string }[] = [];
  if (product.variants.some((v) => v.colorName)) options.push({ name: 'Farbe', value: (v) => v.colorName ?? 'Standard' });
  if (product.variants.some((v) => v.size)) options.push({ name: 'Größe', value: (v) => v.size ?? 'Standard' });
  // Shopify's marker for a product without options.
  if (options.length === 0) options.push({ name: 'Title', value: () => 'Default Title' });

  const metafields: MetafieldInput[] = [];
  if (fiber.value) metafields.push(text('fiber', fiber.value));
  if (filling.value) metafields.push(text('fiber_filling', filling.value));
  if (product.careNotes) metafields.push(text('care_instructions', product.careNotes));
  if (product.safetyNotes) metafields.push(text('safety_information', product.safetyNotes));
  if (manufacturer) metafields.push(text('manufacturer', `${manufacturer.name}\n${manufacturer.address}\n${manufacturer.email}`));

  const linked = product.shopifyProductId !== null;
  const input: ProductSetInput = {
    ...(linked ? { id: product.shopifyProductId ?? '' } : { handle: productHandle(product.name, product.number) }),
    title: product.name,
    descriptionHtml: textToHtml(product.description ?? ''),
    ...(manufacturer ? { vendor: manufacturer.name } : {}),
    productType: product.categoryName,
    ...(product.archived ? { status: 'ARCHIVED' as const } : linked ? {} : { status: 'DRAFT' as const }),
    productOptions: options.map((o) => ({ name: o.name, values: [...new Set(product.variants.map(o.value))].map((name) => ({ name })) })),
    metafields,
    variants: product.variants.map((v) => ({
      ...(v.shopifyVariantId ? { id: v.shopifyVariantId } : {}),
      sku: v.sku,
      price: centsToEuros(v.priceGross ?? 0).toFixed(2),
      taxable: true,
      optionValues: options.map((o) => ({ optionName: o.name, name: o.value(v) })),
      inventoryItem: {
        tracked: true,
        requiresShipping: true,
        harmonizedSystemCode: v.hsCode || null,
        countryCodeOfOrigin: v.originCountry || null,
      },
      metafields: [
        ...(v.fiber ? [text('fiber', v.fiber)] : []),
        ...(v.fiberFilling ? [text('fiber_filling', v.fiberFilling)] : []),
      ],
    })),
  };
  return { input, warnings };
}

export interface ProductDiff {
  changes: { field: string; from: string | null; to: string | null }[];
  /** SKUs Shopify has on the product but the dashboard does not: `productSet` removes them. */
  removedVariants: string[];
}

const METAFIELD_LABELS: Record<string, string> = {
  fiber: 'Faser',
  fiber_filling: 'Faser Füllung',
  care_instructions: 'Pflegehinweise',
  safety_information: 'Sicherheitshinweise',
  manufacturer: 'Hersteller (GPSR)',
};

/** Field label → value, the same way for the desired and the current state. */
function flatten(input: ProductSetInput): Map<string, string | null> {
  const fields = new Map<string, string | null>([
    ['Titel', input.title],
    ['Beschreibung', input.descriptionHtml],
    ['Produkttyp', input.productType],
    ['Optionen', input.productOptions.map((o) => `${o.name}: ${o.values.map((v) => v.name).join(', ')}`).join(' · ')],
  ]);
  if (input.vendor !== undefined) fields.set('Marke', input.vendor);
  if (input.status !== undefined) fields.set('Status', input.status);
  for (const m of input.metafields) fields.set(METAFIELD_LABELS[m.key] ?? m.key, m.value);
  for (const v of input.variants) {
    fields.set(`${v.sku} · Preis`, v.price);
    fields.set(`${v.sku} · Optionen`, v.optionValues.map((o) => o.name).join(' / '));
    fields.set(`${v.sku} · HS-Code`, v.inventoryItem.harmonizedSystemCode);
    fields.set(`${v.sku} · Herkunft`, v.inventoryItem.countryCodeOfOrigin);
    for (const m of v.metafields) fields.set(`${v.sku} · ${METAFIELD_LABELS[m.key] ?? m.key}`, m.value);
  }
  return fields;
}

/** What a push would change; `current` is Shopify's state in the same shape, null for a new product. */
export function diffProductSet(desired: ProductSetInput, current: ProductSetInput | null): ProductDiff {
  const want = flatten(desired);
  const have = current ? flatten(current) : new Map<string, string | null>();
  const changes: ProductDiff['changes'] = [];
  for (const [field, to] of want) {
    const from = have.get(field) ?? null;
    if (from !== to && !(from === null && to === '')) changes.push({ field, from, to });
  }
  const skus = new Set(desired.variants.map((v) => v.sku));
  return { changes, removedVariants: (current?.variants ?? []).map((v) => v.sku).filter((sku) => !skus.has(sku)) };
}
