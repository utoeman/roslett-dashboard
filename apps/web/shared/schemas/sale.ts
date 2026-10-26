/** Sales (orders) entered by hand; Shopify imports use the same shape later. */

import { z } from 'zod';
import { listQuerySchema, moneySchema, requiredText, uuidSchema } from './common.js';
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
});

export type CreateSale = z.infer<typeof createSaleSchema>;
