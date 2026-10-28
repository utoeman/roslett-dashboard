/** Sales (orders) entered by hand; Shopify imports use the same shape later. */

import { z } from 'zod';
import { flagSchema, listQuerySchema, moneySchema, optionalText, requiredText, uuidSchema } from './common.js';
import { isoDateSchema } from './goods-receipt.js';

const quantitySchema = z.coerce
  .number()
  .int({ message: 'Menge muss eine ganze Zahl sein.' })
  .min(1, { message: 'Menge muss mindestens 1 sein.' });

const amountSchema = (field: string) =>
  moneySchema(field).pipe(z.number().min(0, { message: `${field} darf nicht negativ sein.` }));

export const saleStatuses = ['open', 'shipped', 'cancelled'] as const;

export const countrySchema = z
  .string({ error: 'Lieferland fehlt.' })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, { message: 'Lieferland als Ländercode, z. B. DE.' });

export const saleItemSchema = z.object({
  variantId: uuidSchema,
  quantity: quantitySchema,
  unitPriceGross: amountSchema('VK brutto'),
});

export const createSaleSchema = z.object({
  /** Required by hand; only imports may lack a channel (B9). */
  channelId: uuidSchema,
  externalOrderNumber: requiredText('Bestellnummer', 100),
  orderedAt: isoDateSchema,
  deliveryCountry: countrySchema.default('DE'),
  /** Without a value the channel's shipping price and free-shipping threshold apply. */
  shippingRevenueGross: amountSchema('Versanderlös').optional(),
  /** Without a value the channel's default postage applies. */
  postageCost: amountSchema('Porto').optional(),
  discountGross: amountSchema('Rabatt').default(0),
  items: z.array(saleItemSchema).min(1, { message: 'Ein Verkauf braucht mindestens eine Position.' }),
});

export const saleQuerySchema = listQuerySchema.pick({ search: true, limit: true, offset: true }).extend({
  channelId: uuidSchema.optional(),
  status: z.enum(saleStatuses).optional(),
  shortfallOnly: flagSchema().default(false),
  returnedOnly: flagSchema().default(false),
});

/** Cancelling is a reversal with its own route, not a status change. */
export const updateSaleSchema = z.object({
  status: z.enum(['open', 'shipped'], { message: 'Status muss offen oder versendet sein.' }),
});

export const cancelSaleSchema = z.object({ note: optionalText(500) });

/**
 * Return (goods back, `restocked`), refund without goods (quantity, not
 * restocked) or goodwill on the whole order (no line, quantity 0).
 */
export const createRefundSchema = z
  .object({
    saleItemId: uuidSchema.nullable().default(null),
    quantity: z.coerce.number().int({ message: 'Menge muss eine ganze Zahl sein.' }).min(0, { message: 'Menge darf nicht negativ sein.' }).default(0),
    amountGross: amountSchema('Betrag'),
    restocked: flagSchema().default(false),
    damaged: flagSchema().default(false),
    refundedAt: isoDateSchema,
    note: optionalText(500),
  })
  .superRefine((r, ctx) => {
    if (r.quantity > 0 && r.saleItemId === null) {
      ctx.addIssue({ code: 'custom', path: ['saleItemId'], message: 'Für eine Menge bitte die Position wählen.' });
    }
    if (r.restocked && r.quantity === 0) {
      ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Eine Retoure braucht mindestens 1 Stück.' });
    }
    if (r.damaged && !r.restocked) {
      ctx.addIssue({ code: 'custom', path: ['damaged'], message: 'Beschädigt gibt es nur bei einer Retoure.' });
    }
    if (r.quantity === 0 && r.amountGross === 0) {
      ctx.addIssue({ code: 'custom', path: ['amountGross'], message: 'Betrag oder Menge angeben.' });
    }
  });

export type CreateSale = z.infer<typeof createSaleSchema>;
export type CreateRefund = z.infer<typeof createRefundSchema>;
