/**
 * API response types shared by server and client. Money is always integer
 * cents, percentages are rates (0.19 = 19 %).
 */

export type CategoryGroup = 'textile' | 'decor';
export type VatCategory = 'standard' | 'reduced';

export interface Category {
  id: string;
  code: string;
  name: string;
  group: CategoryGroup;
  archivedAt: string | null;
  /** Codes in use can no longer change. */
  inUse?: boolean;
}

export interface Color {
  id: string;
  code: string;
  name: string;
  archivedAt: string | null;
  inUse?: boolean;
}

export interface VatRate {
  id: string;
  country: string;
  vatCategory: VatCategory;
  /** Rate, 0.19 = 19 %. */
  rate: number | null;
  /** ISO date. */
  validFrom: string;
}

export interface Variant {
  id: string;
  sku: string;
  color: Pick<Color, 'id' | 'code' | 'name'> | null;
  size: string | null;
  /** Built from color and size. */
  label: string;
  /** Cents; null means the product's base price applies. */
  priceGross: number | null;
  minimumStock: number;
  archivedAt: string | null;
}

export interface Product {
  id: string;
  number: number;
  name: string;
  description: string | null;
  category: Pick<Category, 'id' | 'code' | 'name' | 'group'>;
  /** Cents. */
  basePriceGross: number | null;
  vatCategory: VatCategory;
  archivedAt: string | null;
  createdAt: string;
  variants: Variant[];
}

export interface CostItem {
  id: string;
  variantId: string | null;
  label: string;
  kind: 'fix' | 'percent';
  /** Cents for "fix", a rate for "percent". */
  value: number | null;
  inputTaxDeductible: boolean;
  active: boolean;
  distributionMethod: 'value' | 'quantity';
}

export interface ProductDetail extends Product {
  costItems: CostItem[];
}

export interface Supplier {
  id: string;
  name: string;
  country: string | null;
  defaultCurrency: string;
  note: string | null;
  archivedAt: string | null;
}

export interface Channel {
  id: string;
  name: string;
  /** Rate, 0.065 = 6.5 %. */
  feePercent: number | null;
  /** Cents. */
  feeFixed: number | null;
  pricingRule: 'same_margin' | 'fixed';
  active: boolean;
}

/** Envelope of all list responses. */
export interface List<T> {
  items: T[];
  total: number;
  limit?: number;
  offset?: number;
}
