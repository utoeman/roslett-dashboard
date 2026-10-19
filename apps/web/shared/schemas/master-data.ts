/** Category and color codes and VAT rates (settings). */

import { z } from 'zod';
import { percentSchema, requiredText } from './common.js';

export const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, { message: 'Kürzel muss aus genau drei Buchstaben bestehen, etwa KIS.' });

export const categoryGroupSchema = z.enum(['textile', 'decor'], {
  message: 'Gruppe muss Textil oder Deko sein.',
});

export const vatCategorySchema = z.enum(['standard', 'reduced'], {
  message: 'MwSt-Kategorie muss normal oder ermäßigt sein.',
});

const archivedAt = z.coerce.date().nullable().optional();

export const createCategorySchema = z.object({
  code: codeSchema,
  name: requiredText('Name', 100),
  group: categoryGroupSchema,
});

/** `code` can only change while the category is unused. */
export const updateCategorySchema = z.object({
  code: codeSchema.optional(),
  name: requiredText('Name', 100).optional(),
  group: categoryGroupSchema.optional(),
  archivedAt,
});

export const createColorSchema = z.object({
  code: codeSchema,
  name: requiredText('Name', 100),
});

export const updateColorSchema = z.object({
  code: codeSchema.optional(),
  name: requiredText('Name', 100).optional(),
  archivedAt,
});

const countrySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, { message: 'Land muss ein zweistelliger Ländercode sein, etwa DE.' });

const validFromSchema = z.iso.date({ message: 'Gültig ab muss ein Datum sein (JJJJ-MM-TT).' });

export const createVatRateSchema = z.object({
  country: countrySchema,
  vatCategory: vatCategorySchema,
  rate: percentSchema('Satz', 50),
  validFrom: validFromSchema,
});

export const updateVatRateSchema = z.object({
  rate: percentSchema('Satz', 50).optional(),
  validFrom: validFromSchema.optional(),
});

export type CreateCategory = z.infer<typeof createCategorySchema>;
export type CreateColor = z.infer<typeof createColorSchema>;
export type CreateVatRate = z.infer<typeof createVatRateSchema>;
