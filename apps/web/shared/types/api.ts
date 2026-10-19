/**
 * API response types shared by server and client. Money is always integer
 * cents, percentages are rates (0.19 = 19 %).
 */

export interface Variant {
  id: string;
  sku: string;
  label: string;
  minimumStock: number;
  /** Cents or null. */
  basePriceNet: number | null;
  /** Rate, 0.19 = 19 %. */
  vatRate: number | null;
  archivedAt: string | null;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
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
