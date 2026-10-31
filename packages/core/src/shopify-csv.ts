/**
 * Product CSV in Shopify's import format, for creating products before the API
 * connection (stage 3). Variant metafields, HS code and country of origin have
 * no CSV column; stock quantities are left to Shopify (relative pushes only).
 */

import { centsToEuros, type Cents } from './money.js';

export interface ShopifyExportVariant {
  sku: string;
  colorName: string | null;
  size: string | null;
  /** Gross shelf price, the product's base price already applied. */
  priceGross: Cents | null;
  /** Weighted average landed cost of open batches. */
  costEur: Cents | null;
  fiber: string | null;
  fiberFilling: string | null;
}

export interface ShopifyExportProduct {
  number: number;
  name: string;
  description: string | null;
  categoryName: string;
  textile: boolean;
  careNotes: string | null;
  safetyNotes: string | null;
  variants: ShopifyExportVariant[];
}

export interface Manufacturer {
  name: string;
  address: string;
  email: string;
}

const HEADER = [
  'Title',
  'URL handle',
  'Description',
  'Vendor',
  'Type',
  'Published on online store',
  'Status',
  'SKU',
  'Option1 name',
  'Option1 value',
  'Option2 name',
  'Option2 value',
  'Price',
  'Cost per item',
  'Charge tax',
  'Inventory tracker',
  'Requires shipping',
  'Faser (product.metafields.custom.fiber)',
  'Faser Füllung (product.metafields.custom.fiber_filling)',
  'Pflegehinweise (product.metafields.custom.care_instructions)',
  'Sicherheitshinweise (product.metafields.custom.safety_information)',
  'Hersteller (product.metafields.custom.manufacturer)',
] as const;

type Column = (typeof HEADER)[number];

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

/** RFC 4180: quote fields with separators, quotes or line breaks. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  const field = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return rows.map((row) => row.map(field).join(',') + '\r\n').join('');
}

const price = (cents: Cents | null) => (cents === null ? '' : centsToEuros(cents).toFixed(2));

export const textToHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

/** The common value of all variants, or null plus a flag when they differ. */
export function commonValue(values: readonly (string | null)[]): { value: string | null; differs: boolean } {
  const distinct = new Set(values);
  return distinct.size === 1 ? { value: values[0] ?? null, differs: false } : { value: null, differs: true };
}

export function buildShopifyCsv(
  products: readonly ShopifyExportProduct[],
  manufacturer: Manufacturer | null,
): { rows: string[][]; warnings: string[] } {
  const warnings: string[] = [];
  if (manufacturer === null) warnings.push('Herstellerangaben fehlen (Einstellungen → Hersteller).');
  const manufacturerText = manufacturer ? `${manufacturer.name}\n${manufacturer.address}\n${manufacturer.email}` : '';

  const rows: string[][] = [[...HEADER]];
  for (const product of products) {
    const label = `${String(product.number).padStart(4, '0')} ${product.name}`;
    const handle = productHandle(product.name, product.number);

    const fiber = commonValue(product.variants.map((v) => v.fiber));
    const filling = commonValue(product.variants.map((v) => v.fiberFilling));
    if (fiber.differs) warnings.push(`${label}: Faser je Variante unterschiedlich – in Shopify je Variante nachtragen.`);
    else if (product.textile && fiber.value === null) warnings.push(`${label}: Faserangabe fehlt.`);
    if (filling.differs) {
      warnings.push(`${label}: Faser Füllung je Variante unterschiedlich – in Shopify je Variante nachtragen.`);
    }

    const options: { name: string; value: (v: ShopifyExportVariant) => string }[] = [];
    if (product.variants.some((v) => v.colorName)) options.push({ name: 'Farbe', value: (v) => v.colorName ?? 'Standard' });
    if (product.variants.some((v) => v.size)) options.push({ name: 'Größe', value: (v) => v.size ?? 'Standard' });
    // Shopify's marker for a product without options.
    if (options.length === 0) options.push({ name: 'Title', value: () => 'Default Title' });

    product.variants.forEach((variant, index) => {
      if (variant.priceGross === null) warnings.push(`${variant.sku}: kein Preis.`);
      const first = index === 0;
      const cells: Partial<Record<Column, string>> = {
        'URL handle': handle,
        SKU: variant.sku,
        'Option1 name': options[0]?.name ?? '',
        'Option1 value': options[0]?.value(variant) ?? '',
        'Option2 name': options[1]?.name ?? '',
        'Option2 value': options[1]?.value(variant) ?? '',
        Price: price(variant.priceGross),
        'Cost per item': price(variant.costEur),
        'Charge tax': 'TRUE',
        'Inventory tracker': 'shopify',
        'Requires shipping': 'TRUE',
        // Product fields only on the first row; Shopify ignores them on variant rows.
        ...(first
          ? {
              Title: product.name,
              Description: textToHtml(product.description ?? ''),
              Vendor: manufacturer?.name ?? '',
              Type: product.categoryName,
              'Published on online store': 'FALSE',
              Status: 'draft',
              'Faser (product.metafields.custom.fiber)': fiber.value ?? '',
              'Faser Füllung (product.metafields.custom.fiber_filling)': filling.value ?? '',
              'Pflegehinweise (product.metafields.custom.care_instructions)': product.careNotes ?? '',
              'Sicherheitshinweise (product.metafields.custom.safety_information)': product.safetyNotes ?? '',
              'Hersteller (product.metafields.custom.manufacturer)': manufacturerText,
            }
          : {}),
      };
      rows.push(HEADER.map((column) => cells[column] ?? ''));
    });
  }
  return { rows, warnings };
}
