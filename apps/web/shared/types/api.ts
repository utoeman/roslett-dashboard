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
  /** Shopify standard product taxonomy; sent as the product category. */
  shopifyCategoryId: string | null;
  shopifyCategoryName: string | null;
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
  fiber: string | null;
  fiberFilling: string | null;
  /** ISO 3166 alpha-2. */
  originCountry: string | null;
  hsCode: string | null;
  /** Shipping weight per unit in grams. */
  weightGrams: number | null;
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
  /** Cents; purchase price part of `averageCostEur`, without additional costs. */
  averagePurchaseEur: number | null;
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
  careNotes: string | null;
  safetyNotes: string | null;
  /** Set once the product is in Shopify (linked or pushed). */
  shopifyProductId: string | null;
  archivedAt: string | null;
  createdAt: string;
  variants: Variant[];
}

export interface CompanySettings {
  manufacturerName: string;
  manufacturerAddress: string;
  manufacturerEmail: string;
  updatedAt: string;
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
  /** Cents. */
  shippingPriceGross: number | null;
  /** Goods value gross from which shipping is free; null = never. */
  freeShippingFrom: number | null;
  defaultPostage: number | null;
  active: boolean;
  /** Shopify `sourceName` values mapped to this channel. */
  shopifySources: string[];
}

export type DeliveryState = 'open' | 'partial' | 'complete';

export type ReceiptKind = 'purchase' | 'production';

export interface GoodsReceiptListItem {
  id: string;
  kind: ReceiptKind;
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
  kind: 'freight' | 'customs' | 'fabric' | 'accessories' | 'other' | 'credit';
  /** Cents; negative for credits. */
  amountEur: number;
  distributionMethod: 'value' | 'quantity';
  incurredOn: string;
  note: string | null;
}

export interface GoodsReceipt {
  id: string;
  kind: ReceiptKind;
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
  /** Entries of a sale are reversed through the sale, not in the journal. */
  saleId: string | null;
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

export type SaleStatus = 'open' | 'shipped' | 'cancelled';

/** Derived from refunded quantities. */
export type ReturnState = 'none' | 'partial' | 'full';

export interface SaleRefund {
  id: string;
  /** null for goodwill on the whole order. */
  saleItemId: string | null;
  quantity: number;
  /** Cents. */
  amountGross: number;
  restocked: boolean;
  damaged: boolean;
  refundedAt: string;
  note: string | null;
}

export interface SaleListItem {
  id: string;
  /** null for imported orders of an unknown source. */
  channelName: string | null;
  externalOrderNumber: string;
  orderedAt: string;
  deliveryCountry: string;
  status: SaleStatus;
  pieces: number;
  /** Cents. */
  goodsGross: number;
  /** Units still without a batch. */
  shortfall: number;
  returnState: ReturnState;
  contributionMarginEur: number | null;
  margin: number | null;
}

/** All amounts in cents; margin as a rate of net revenue. */
export interface SaleFigures {
  goodsGross: number;
  revenueNetEur: number;
  costOfGoodsEur: number;
  costItemsEur: number;
  feesEur: number;
  postageEur: number;
  shippingRevenueNetEur: number;
  discountNetEur: number;
  refundNetEur: number;
  contributionMarginEur: number;
  margin: number;
}

export interface SaleItem extends SaleFigures {
  id: string;
  variant: { id: string; sku: string; label: string; productId: string; productName: string };
  quantity: number;
  unitPriceGross: number;
  vatRate: number;
  shortfall: number;
  refundedQuantity: number;
}

export interface Sale {
  id: string;
  channel: { id: string; name: string } | null;
  externalOrderNumber: string;
  orderedAt: string;
  deliveryCountry: string;
  shippingRevenueGross: number;
  postageCost: number;
  discountGross: number;
  status: SaleStatus;
  returnState: ReturnState;
  createdAt: string;
  fees: { id: string; kind: string; amount: number; source: 'flat' | 'api' }[];
  refunds: SaleRefund[];
  items: SaleItem[];
  totals: SaleFigures;
  /** Cost is partly estimated while a shortfall is open. */
  provisional: boolean;
}

/** One dashboard variant with its Shopify counterpart (G5, G6). */
export interface ShopifyMatchRow {
  variantId: string;
  sku: string;
  productName: string;
  dashboardStock: number;
  /** Null when the SKU is missing or ambiguous in Shopify. */
  shopifyStock: number | null;
  status: 'linked' | 'matched' | 'missing' | 'duplicate';
}

export interface ShopifyStatus {
  configured: boolean;
  shop: string | null;
  rows: ShopifyMatchRow[];
  /** Shopify variants with an empty or unknown SKU. */
  unknownInShopify: { sku: string | null; variantId: string }[];
  /** Where the next order import starts; null before the first one. */
  ordersSyncedTo: string | null;
  /** Last import of any trigger; null before the first one. */
  lastRun: { at: string; trigger: 'manual' | 'scheduled' | 'nightly'; result: ShopifySyncResult } | null;
}

export interface ShopifyPricePushResult {
  /** Variants whose price was written. */
  prices: number;
  /** Inventory items whose cost was written. */
  costs: number;
  errors: { sku: string; message: string }[];
}

export interface ReceiptShopifyPreview {
  /** Open entries of the receipt per variant; empty when everything is in Shopify. */
  lines: { sku: string; delta: number; shopifyStock: number | null }[];
  locations: { id: string; name: string }[];
}

export interface ReceiptShopifyPushResult {
  location: string;
  lines: { sku: string; delta: number }[];
}

export interface ShopifyProductPreview {
  /** No product in Shopify yet: it is created as a draft. */
  isNew: boolean;
  pushedAt: string | null;
  /** The dashboard data differs from what was sent last time. */
  changedSincePush: boolean;
  changes: { field: string; from: string | null; to: string | null }[];
  /** SKUs Shopify would remove from the product. */
  removedVariants: string[];
  warnings: string[];
}

export interface ShopifyProductPushResult {
  productId: string;
  variants: number;
  warnings: string[];
}

export interface ShopifyImage {
  id: string;
  alt: string | null;
  /** UPLOADED, PROCESSING, READY or FAILED; Shopify processes new images asynchronously. */
  status: string;
  /** Preview, null while processing. */
  url: string | null;
  /** Colours whose variants show this image. */
  colors: string[];
}

export interface ShopifyImageAttached {
  /** The new image; null if Shopify did not list it yet. */
  mediaId: string | null;
  images: ShopifyImage[];
}

export interface ShopifyImageAssigned {
  /** False while Shopify still processes the image; the browser asks again. */
  ready: boolean;
  images: ShopifyImage[];
}

export interface ShopifyStagedUpload {
  url: string;
  resourceUrl: string;
  parameters: { name: string; value: string }[];
}

export interface ShopifyStockChangesPreview {
  /** Per variant: the sum to send and the entries behind it. */
  lines: {
    sku: string;
    delta: number;
    shopifyStock: number | null;
    entries: { kind: string; quantity: number; postedAt: string }[];
  }[];
  locations: { id: string; name: string }[];
}

export interface ShopifyTaxonomyCategory {
  id: string;
  /** Full path in English, e.g. "Home & Garden > Linens & Bedding > Table Linens > Placemats". */
  name: string;
}

export interface ShopifySyncResult {
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  warnings: { order: string; message: string }[];
  /** Orders not booked; the next import tries them again. */
  errors: { order: string; message: string }[];
  syncedTo: string;
}

/** Envelope of all list responses. */
export interface List<T> {
  items: T[];
  total: number;
  limit?: number;
  offset?: number;
}
