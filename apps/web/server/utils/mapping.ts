/** Database rows to API objects: money as cents, percentages as rates. */

import { buildVariantLabel } from '@roslett/core';
import { numericToCents, numericToRate } from './money.js';

type ColorRef = { id: string; code: string; name: string };

type VariantRow = {
  id: string;
  sku: string;
  size: string | null;
  priceGross: string | null;
  minimumStock: number;
  fiber: string | null;
  fiberFilling: string | null;
  originCountry: string | null;
  hsCode: string | null;
  archivedAt: Date | null;
  color: ColorRef | null;
};

export function mapVariant(row: VariantRow) {
  return {
    id: row.id,
    sku: row.sku,
    color: row.color ? { id: row.color.id, code: row.color.code, name: row.color.name } : null,
    size: row.size,
    label: buildVariantLabel(row.color?.name, row.size),
    priceGross: numericToCents(row.priceGross),
    minimumStock: row.minimumStock,
    fiber: row.fiber,
    fiberFilling: row.fiberFilling,
    originCountry: row.originCountry,
    hsCode: row.hsCode,
    archivedAt: row.archivedAt,
  };
}

type ProductRow = {
  id: string;
  number: number;
  name: string;
  description: string | null;
  basePriceGross: string | null;
  vatCategory: 'standard' | 'reduced';
  careNotes: string | null;
  safetyNotes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  category: { id: string; code: string; name: string; group: 'textile' | 'decor' };
  variants: VariantRow[];
};

export function mapProduct(row: ProductRow) {
  return {
    id: row.id,
    number: row.number,
    name: row.name,
    description: row.description,
    category: {
      id: row.category.id,
      code: row.category.code,
      name: row.category.name,
      group: row.category.group,
    },
    basePriceGross: numericToCents(row.basePriceGross),
    vatCategory: row.vatCategory,
    careNotes: row.careNotes,
    safetyNotes: row.safetyNotes,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    variants: row.variants.map(mapVariant),
  };
}

type VatRateRow = {
  id: string;
  country: string;
  vatCategory: 'standard' | 'reduced';
  rate: string;
  validFrom: string;
};

export function mapVatRate(row: VatRateRow) {
  return {
    id: row.id,
    country: row.country,
    vatCategory: row.vatCategory,
    rate: numericToRate(row.rate),
    validFrom: row.validFrom,
  };
}

type CostItemRow = {
  id: string;
  variantId: string | null;
  label: string;
  kind: 'fix' | 'percent';
  value: string;
  inputTaxDeductible: boolean;
  active: boolean;
  distributionMethod: 'value' | 'quantity';
};

/** `value` is cents for "fix" and a rate for "percent"; decided only here. */
export function mapCostItem(row: CostItemRow) {
  return {
    id: row.id,
    variantId: row.variantId,
    label: row.label,
    kind: row.kind,
    value:
      row.kind === 'fix' ? numericToCents(row.value) : numericToRate(row.value),
    inputTaxDeductible: row.inputTaxDeductible,
    active: row.active,
    distributionMethod: row.distributionMethod,
  };
}

type ChannelRow = {
  id: string;
  name: string;
  feePercent: string;
  feeFixed: string;
  pricingRule: 'same_margin' | 'fixed';
  shippingPriceGross: string;
  freeShippingFrom: string | null;
  defaultPostage: string;
  active: boolean;
};

export function mapChannel(row: ChannelRow) {
  return {
    id: row.id,
    name: row.name,
    feePercent: numericToRate(row.feePercent),
    feeFixed: numericToCents(row.feeFixed),
    pricingRule: row.pricingRule,
    shippingPriceGross: numericToCents(row.shippingPriceGross),
    freeShippingFrom: numericToCents(row.freeShippingFrom),
    defaultPostage: numericToCents(row.defaultPostage),
    active: row.active,
  };
}
