/**
 * Abbildung von Datenbankzeilen auf Antwortobjekte.
 *
 * Jede Route liefert dieselbe Form, damit die Oberflaeche nicht je Endpunkt
 * unterscheiden muss. Insbesondere sind Geldbetraege in jeder Antwort
 * ganzzahlige Cent und Prozentsaetze immer Raten – nie der rohe
 * NUMERIC-String aus Postgres.
 */

import { numericToCents, numericToRate } from './money.js';

type VariantRow = {
  id: string;
  productId?: string;
  sku: string;
  label: string;
  minimumStock: number;
  basePriceNet: string | null;
  vatRate: string;
  archivedAt: Date | null;
  createdAt?: Date;
};

export function mapVariant(row: VariantRow) {
  return {
    id: row.id,
    sku: row.sku,
    label: row.label,
    minimumStock: row.minimumStock,
    basePriceNet: numericToCents(row.basePriceNet),
    vatRate: numericToRate(row.vatRate),
    archivedAt: row.archivedAt,
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

/**
 * Der Wert bedeutet je nach Art etwas anderes: bei "fix" ein Cent-Betrag,
 * bei "percent" eine Rate. Diese Unterscheidung an genau einer Stelle zu
 * treffen verhindert, dass irgendwo eine Rate als Betrag gelesen wird.
 */
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
  active: boolean;
};

export function mapChannel(row: ChannelRow) {
  return {
    id: row.id,
    name: row.name,
    feePercent: numericToRate(row.feePercent),
    feeFixed: numericToCents(row.feeFixed),
    pricingRule: row.pricingRule,
    active: row.active,
  };
}
