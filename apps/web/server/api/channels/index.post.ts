import { schema, useDb } from '../../db/client.js';
import { createChannelSchema } from '../../../shared/schemas/channel.js';
import { readBody, requireFound } from '../../utils/validation.js';
import { databaseError } from '../../utils/errors.js';
import { centsToNumeric, rateToNumeric } from '../../utils/money.js';
import { mapChannel } from '../../utils/mapping.js';

export default defineEventHandler(async (event) => {
  const input = await readBody(event, createChannelSchema);
  try {
    const [channel] = await useDb()
      .insert(schema.channels)
      .values({
        name: input.name,
        feePercent: rateToNumeric(input.feePercent) ?? '0',
        feeFixed: centsToNumeric(input.feeFixed) ?? '0',
        pricingRule: input.pricingRule,
        active: input.active,
      })
      .returning();
    setResponseStatus(event, 201);
    return mapChannel(requireFound(channel, 'Der Kanal'));
  } catch (error) {
    throw databaseError(error, 'Kanal anlegen');
  }
});
