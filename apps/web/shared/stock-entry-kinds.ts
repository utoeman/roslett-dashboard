import type { StockEntryKind } from './types/api.js';

export const STOCK_ENTRY_KIND_LABELS: Record<StockEntryKind, string> = {
  goods_receipt: 'Wareneingang',
  sale: 'Verkauf',
  return: 'Retoure',
  shrinkage: 'Schwund',
  own_use: 'Eigenverbrauch',
  stocktake: 'Inventur',
  supplier_return: 'Rückgabe an Lieferant',
  reversal: 'Storno',
};
