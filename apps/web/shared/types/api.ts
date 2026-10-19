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
  /** Only in product responses; derived from the journal. */
  inventory?: VariantInventory;
}

export interface VariantInventory {
  stock: number;
  /** Cents; remaining stock valued FIFO at landed cost. */
  stockValueEur: number;
  /** Cents; average of remaining stock, else the newest landed cost, null without receipts. */
  averageCostEur: number | null;
  belowMinimum: boolean;
  /** Cents; null without price, VAT rate or landed cost. */
  priceNetEur: number | null;
  /** Before channel fees and cost items. */
  marginEur: number | null;
  margin: number | null;
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
  /** VAT rates valid today in the sales country, per category. */
  vatRates: Partial<Record<VatCategory, number>>;
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

export type DeliveryState = 'open' | 'partial' | 'complete';

export interface GoodsReceiptListItem {
  id: string;
  number: string;
  supplierName: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  currency: string;
  state: 'draft' | 'posted';
  positions: number;
  ordered: number;
  delivered: number;
  deliveryState: DeliveryState;
  /** Cents. */
  goodsValueEur: number;
}

export interface ReceiptPosition {
  id: string;
  variant: { id: string; sku: string; label: string; productId: string; productName: string };
  quantityOrdered: number;
  delivered: number;
  deliveryState: DeliveryState;
  /** Minor units of the invoice currency. */
  unitPriceForeign: number;
  /** All EUR values in cents; landed cost is per unit and computed. */
  unitPriceEur: number;
  additionalCostsEur: number;
  landedCostEur: number;
  note: string | null;
}

export interface AdditionalCost {
  id: string;
  kind: 'freight' | 'customs' | 'other' | 'credit';
  /** Cents; negative for credits. */
  amountEur: number;
  distributionMethod: 'value' | 'quantity';
  incurredOn: string;
  note: string | null;
}

export interface GoodsReceipt {
  id: string;
  number: string;
  supplier: { id: string; name: string };
  invoiceNumber: string | null;
  invoiceDate: string;
  currency: string;
  /** Foreign units per 1 EUR (ECB convention). */
  exchangeRate: number;
  exchangeRateSource: 'ecb' | 'manual';
  state: 'draft' | 'posted';
  deliveryState: DeliveryState;
  createdAt: string;
  positions: ReceiptPosition[];
  additionalCosts: AdditionalCost[];
  totals: {
    quantityOrdered: number;
    delivered: number;
    goodsValueEur: number;
    additionalCostsEur: number;
    landedTotalEur: number;
  };
}

export type StockEntryKind =
  | 'goods_receipt'
  | 'sale'
  | 'return'
  | 'shrinkage'
  | 'own_use'
  | 'stocktake'
  | 'supplier_return'
  | 'reversal';

export interface StockEntry {
  id: string;
  postedAt: string;
  kind: StockEntryKind;
  /** Signed: receipts positive, issues negative. */
  quantity: number;
  note: string | null;
  variant: { id: string; sku: string; label: string; productName: string };
  batches: { batchId: string | null; receiptNumber: string | null; quantity: number }[];
  /** Negative while part of an issue is not covered by stock. */
  openShortfall: number;
  reversesId: string | null;
  reversedById: string | null;
}

export interface BatchOption {
  id: string;
  receiptNumber: string | null;
  invoiceDate: string;
  remaining: number;
}

export interface StockSummary {
  units: number;
  /** Cents. */
  valueEur: number;
  variantsBelowMinimum: number;
}

/** Envelope of all list responses. */
export interface List<T> {
  items: T[];
  total: number;
  limit?: number;
  offset?: number;
}
