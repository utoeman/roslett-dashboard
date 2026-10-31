import { schema, useDb } from '../../db/client.js';
import { createChannelSchema } from '../../../shared/schemas/channel.js';
import { readJsonBody, requireFound } from '../../utils/validation.js';
import { databaseError } from '../../utils/errors.js';
import { centsToNumeric, rateToNumeric } from '../../utils/money.js';
import { mapChannel } from '../../utils/mapping.js';
import { assertShopifySourcesFree } from '../../utils/shopify-sync.js';

export default defineEventHandler(async (event) => {
  const input = await readJsonBody(event, createChannelSchema);
  const db = useDb();
  await assertShopifySourcesFree(db, input.shopifySources, null);
  try {
    const [channel] = await db
      .insert(schema.channels)
      .values({
        name: input.name,
        feePercent: rateToNumeric(input.feePercent) ?? '0',
        feeFixed: centsToNumeric(input.feeFixed) ?? '0',
        pricingRule: input.pricingRule,
        shippingPriceGross: centsToNumeric(input.shippingPriceGross) ?? '0',
        freeShippingFrom: centsToNumeric(input.freeShippingFrom),
        defaultPostage: centsToNumeric(input.defaultPostage) ?? '0',
        active: input.active,
        shopifySources: input.shopifySources,
      })
      .returning();
    setResponseStatus(event, 201);
    return mapChannel(requireFound(channel, 'Der Kanal'));
  } catch (error) {
    throw databaseError(error, 'Kanal anlegen');
  }
});
