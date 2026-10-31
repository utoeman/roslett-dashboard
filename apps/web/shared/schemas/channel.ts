import { z } from 'zod';
import { flagSchema, moneySchema, percentSchema, requiredText } from './common.js';

export const pricingRuleSchema = z.enum(['same_margin', 'fixed']);

/** Shopify `sourceName` values of the channel's orders, e.g. `web`. */
const shopifySourcesSchema = z
  .array(z.string().trim().min(1).max(100, { message: 'Eine Shopify-Quelle ist zu lang.' }))
  .max(20, { message: 'Höchstens 20 Shopify-Quellen je Kanal.' })
  .transform((sources) => [...new Set(sources)]);

/**
 * Sales channels. `same_margin` derives the price from the target margin
 * after fees; `fixed` takes a given price and shows what is left.
 */
export const createChannelSchema = z.object({
  name: requiredText('Name'),
  /** Fee on the sales price; input "6,5" becomes 0.065. */
  feePercent: percentSchema('Gebuehr').default(0),
  /** Fixed fee per sale in cents. */
  feeFixed: moneySchema('Fixgebuehr').default(0),
  pricingRule: pricingRuleSchema.default('same_margin'),
  shippingPriceGross: moneySchema('Versandpreis').default(0),
  /** Goods value gross from which shipping is free; empty = never. */
  freeShippingFrom: moneySchema('Versandkostenfrei ab').nullable().default(null),
  defaultPostage: moneySchema('Porto').default(0),
  active: flagSchema().default(true),
  shopifySources: shopifySourcesSchema.default([]),
});

/**
 * Separate update schema without defaults: `.partial()` keeps `.default()`,
 * so renaming a channel would reset its fees.
 */
export const updateChannelSchema = z.object({
  name: requiredText('Name').optional(),
  feePercent: percentSchema('Gebuehr').optional(),
  feeFixed: moneySchema('Fixgebuehr').optional(),
  pricingRule: pricingRuleSchema.optional(),
  shippingPriceGross: moneySchema('Versandpreis').optional(),
  freeShippingFrom: moneySchema('Versandkostenfrei ab').nullable().optional(),
  defaultPostage: moneySchema('Porto').optional(),
  active: flagSchema().optional(),
  shopifySources: shopifySourcesSchema.optional(),
});

export type CreateChannel = z.infer<typeof createChannelSchema>;
export type UpdateChannel = z.infer<typeof updateChannelSchema>;
