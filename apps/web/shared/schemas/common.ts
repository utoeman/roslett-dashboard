/**
 * Building blocks shared by all schemas. Client and server use the same
 * definitions, so form and API rules cannot drift apart. Messages are German
 * because they are shown as-is.
 */

import { z } from 'zod';

export const uuidSchema = z.uuid({ message: 'Keine gueltige Kennung.' });

/** Required, trimmed text with a sensible maximum. */
export const requiredText = (field: string, max = 200) =>
  z
    .string()
    .trim()
    .min(1, { message: `${field} darf nicht leer sein.` })
    .max(max, { message: `${field} ist zu lang (hoechstens ${max} Zeichen).` });

/** Optional text; an empty string becomes null. */
export const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max, { message: `Text ist zu lang (hoechstens ${max} Zeichen).` })
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

/**
 * Money input: a number in euros or a German/English string. Always yields
 * integer cents; this is the only place where the conversion happens.
 */
export const moneySchema = (field = 'Betrag') =>
  z.union([z.number(), z.string()]).transform((value, ctx) => {
    try {
      const cents =
        typeof value === 'number'
          ? Math.round(value * 100)
          : parseMoneyInput(value);
      if (!Number.isFinite(cents)) throw new Error('nicht endlich');
      return cents;
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: `${field} ist kein gueltiger Betrag.`,
      });
      return z.NEVER;
    }
  });

/**
 * Slim copy of the core parser: shared/ runs in the browser and the engine
 * should not end up in the client bundle. Same rule: the last separator wins.
 */
function parseMoneyInput(input: string): number {
  const raw = input.trim().replace(/[€$£\s]/g, '').replace(/(EUR|USD|GBP)/gi, '');
  if (raw === '') throw new Error('leer');

  let text = raw;
  let negative = false;
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }
  if (!/^[\d.,]+$/.test(text)) throw new Error('ungueltig');

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  const separatorAt = Math.max(lastDot, lastComma);

  let whole: string;
  let fraction: string;
  if (separatorAt === -1) {
    whole = text;
    fraction = '';
  } else {
    const afterSeparator = text.slice(separatorAt + 1);
    const separator = text.charAt(separatorAt);
    const singleSeparator =
      text.indexOf(separator) === separatorAt &&
      (separator === '.' ? lastComma : lastDot) === -1;
    if (afterSeparator.length === 3 && singleSeparator) {
      whole = text.replace(/[.,]/g, '');
      fraction = '';
    } else {
      whole = text.slice(0, separatorAt).replace(/[.,]/g, '');
      fraction = afterSeparator;
    }
  }

  if (!/^\d*$/.test(fraction)) throw new Error('ungueltig');
  const wholeNumber = whole === '' ? 0 : Number.parseInt(whole, 10);
  const fractionCents = Number.parseInt((fraction + '00').slice(0, 2), 10);
  const rest =
    fraction.length > 2 ? Number.parseFloat('0.' + fraction.slice(2)) : 0;
  const cents = Math.round(wholeNumber * 100 + fractionCents + rest);
  return negative ? -cents : cents;
}

/** Percentage input: "6,5" means 6.5 % and is stored as the rate 0.065. */
export const percentSchema = (field = 'Prozentsatz', maxPercent = 100) =>
  z.union([z.number(), z.string()]).transform((value, ctx) => {
    const parsed =
      typeof value === 'number'
        ? value
        : Number.parseFloat(value.trim().replace(',', '.').replace('%', ''));
    if (!Number.isFinite(parsed)) {
      ctx.addIssue({ code: 'custom', message: `${field} ist keine gueltige Zahl.` });
      return z.NEVER;
    }
    if (parsed < 0 || parsed > maxPercent) {
      ctx.addIssue({
        code: 'custom',
        message: `${field} muss zwischen 0 und ${maxPercent} liegen.`,
      });
      return z.NEVER;
    }
    return parsed / 100;
  });

/**
 * Boolean from a query string. `z.coerce.boolean()` turns "false" into true.
 * No default here: an inner `.default()` would fill missing PATCH fields and
 * silently overwrite data, so callers set it.
 */
export const flagSchema = () =>
  z
    .union([z.boolean(), z.string()])
    .transform((value) =>
      typeof value === 'boolean' ? value : value === 'true' || value === '1',
    );

/** Paging for list endpoints. */
export const listQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  /** Archived entries are hidden by default. */
  includeArchived: flagSchema().default(false),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListQuery = z.infer<typeof listQuerySchema>;
