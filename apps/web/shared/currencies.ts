/**
 * Selectable invoice currencies: EUR plus the ECB reference currencies, so a
 * daily rate is always available. Codes are ISO 4217.
 */
export const CURRENCIES = [
  { code: 'EUR', name: 'Euro' },
  { code: 'TRY', name: 'Türkische Lira' },
  { code: 'USD', name: 'US-Dollar' },
  { code: 'GBP', name: 'Britisches Pfund' },
  { code: 'CHF', name: 'Schweizer Franken' },
  { code: 'CNY', name: 'Chinesischer Renminbi' },
  { code: 'INR', name: 'Indische Rupie' },
  { code: 'DKK', name: 'Dänische Krone' },
  { code: 'SEK', name: 'Schwedische Krone' },
  { code: 'NOK', name: 'Norwegische Krone' },
  { code: 'PLN', name: 'Polnischer Złoty' },
  { code: 'CZK', name: 'Tschechische Krone' },
  { code: 'HUF', name: 'Ungarischer Forint' },
  { code: 'RON', name: 'Rumänischer Leu' },
  { code: 'ISK', name: 'Isländische Krone' },
  { code: 'JPY', name: 'Japanischer Yen' },
  { code: 'KRW', name: 'Südkoreanischer Won' },
  { code: 'HKD', name: 'Hongkong-Dollar' },
  { code: 'SGD', name: 'Singapur-Dollar' },
  { code: 'THB', name: 'Thailändischer Baht' },
  { code: 'IDR', name: 'Indonesische Rupiah' },
  { code: 'MYR', name: 'Malaysischer Ringgit' },
  { code: 'PHP', name: 'Philippinischer Peso' },
  { code: 'AUD', name: 'Australischer Dollar' },
  { code: 'NZD', name: 'Neuseeland-Dollar' },
  { code: 'CAD', name: 'Kanadischer Dollar' },
  { code: 'MXN', name: 'Mexikanischer Peso' },
  { code: 'BRL', name: 'Brasilianischer Real' },
  { code: 'ILS', name: 'Israelischer Schekel' },
  { code: 'ZAR', name: 'Südafrikanischer Rand' },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]['code'];

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as [CurrencyCode, ...CurrencyCode[]];
