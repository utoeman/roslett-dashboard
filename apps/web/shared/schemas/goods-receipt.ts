/** Goods receipts (supplier invoices), their positions and additional costs. */

import { z } from 'zod';
import { currencyCodeSchema, moneySchema, optionalText, uuidSchema } from './common.js';

export const isoDateSchema = z.iso.date({ message: 'Datum muss im Format JJJJ-MM-TT sein.' });

/** Foreign units per 1 EUR, as published by the ECB. */
const exchangeRateSchema = z.coerce.number().positive({ message: 'Kurs muss größer als null sein.' });

const quantitySchema = z.coerce
  .number()
  .int({ message: 'Menge muss eine ganze Zahl sein.' })
  .min(1, { message: 'Menge muss mindestens 1 sein.' });

export const positionSchema = z.object({
  variantId: uuidSchema,
  quantityOrdered: quantitySchema,
  /** Net unit price in the invoice currency, parsed to minor units. */
  unitPrice: moneySchema('EK netto'),
  note: optionalText(500),
});

export const receiptKinds = ['purchase', 'production'] as const;

export const additionalCostKinds = ['freight', 'customs', 'fabric', 'accessories', 'other', 'credit'] as const;

export const createReceiptSchema = z.object({
  /** Fixed at creation, it decides the number sequence (WE/PR). */
  kind: z.enum(receiptKinds, { message: 'Unbekannte Art.' }).default('purchase'),
  /** Supplier for a purchase, sewing workshop for a production. */
  supplierId: uuidSchema,
  invoiceNumber: optionalText(100),
  invoiceDate: isoDateSchema,
  /** Defaults to the supplier's currency. */
  currency: currencyCodeSchema.optional(),
  /** Manual rate; without it the ECB rate of the invoice date is used. */
  exchangeRate: exchangeRateSchema.optional(),
  positions: z.array(positionSchema).default([]),
});

/** Drafts only. `positions` replaces all positions; `exchangeRate: null` refetches the ECB rate. */
export const updateReceiptSchema = z.object({
  invoiceNumber: optionalText(100),
  invoiceDate: isoDateSchema.optional(),
  currency: currencyCodeSchema.optional(),
  exchangeRate: exchangeRateSchema.nullable().optional(),
  positions: z.array(positionSchema).optional(),
});

export const additionalCostSchema = z.object({
  kind: z.enum(additionalCostKinds, { message: 'Unbekannte Art.' }),
  /** Entered positive; a credit is stored negative. */
  amount: moneySchema('Betrag').refine((cents) => cents > 0, { message: 'Betrag muss größer als null sein.' }),
  distributionMethod: z.enum(['value', 'quantity']).default('value'),
  incurredOn: isoDateSchema.optional(),
  note: optionalText(500),
});

export const receiveSchema = z.object({
  postedAt: isoDateSchema.optional(),
  lines: z.array(z.object({ batchId: uuidSchema, quantity: quantitySchema })).min(1, {
    message: 'Mindestens eine Position mit Menge angeben.',
  }),
});

export type CreateReceipt = z.infer<typeof createReceiptSchema>;
export type Position = z.infer<typeof positionSchema>;
