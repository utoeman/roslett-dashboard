/**
 * Antworttypen der API.
 *
 * Sie liegen in shared/, weil sie beschreiben, worauf sich Server und Client
 * geeinigt haben. Aendert eine Route ihre Antwort, faellt die Abweichung
 * hier auf – und nicht erst zur Laufzeit im Browser.
 *
 * Zur Erinnerung an die Systemgrenze: Geldbetraege sind in jeder Antwort
 * ganzzahlige Cent, Prozentsaetze Raten (0.19 bedeutet 19 Prozent).
 */

export interface Variant {
  id: string;
  sku: string;
  label: string;
  minimumStock: number;
  /** Ganzzahlige Cent oder null. */
  basePriceNet: number | null;
  /** Rate, 0.19 bedeutet 19 Prozent. */
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
  /** Bei "fix" ganzzahlige Cent, bei "percent" eine Rate. */
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
  /** Rate, 0.065 bedeutet 6,5 Prozent. */
  feePercent: number | null;
  /** Ganzzahlige Cent. */
  feeFixed: number | null;
  pricingRule: 'same_margin' | 'fixed';
  active: boolean;
}

/** Gemeinsame Huelle aller Listenantworten. */
export interface List<T> {
  items: T[];
  total: number;
  limit?: number;
  offset?: number;
}
