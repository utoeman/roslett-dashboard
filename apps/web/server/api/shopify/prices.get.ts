import type { PricePlan } from '@roslett/core';
import { useDb } from '../../db/client.js';
import { planShopifyPrices } from '../../utils/shopify-prices.js';

/** Preview: price and cost differences of linked variants; writes nothing. */
export default defineEventHandler((): Promise<PricePlan> => planShopifyPrices(useDb()));
