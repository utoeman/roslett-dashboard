import { eq } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { updateChannelSchema } from '../../../shared/schemas/channel.js';
import { readJsonBody, readId, requireFound } from '../../utils/validation.js';
import { databaseError } from '../../utils/errors.js';
import { centsToNumeric, rateToNumeric } from '../../utils/money.js';
import { mapChannel } from '../../utils/mapping.js';

export default defineEventHandler(async (event) => {
  const id = readId(event);
  const input = await readJsonBody(event, updateChannelSchema);
  const db = useDb();

  requireFound(
    await db.query.channels.findFirst({
      where: eq(schema.channels.id, id),
      columns: { id: true },
    }),
    'Der Kanal',
  );

  const changes: Record<string, unknown> = {};
  if (input.name !== undefined) changes.name = input.name;
  if (input.feePercent !== undefined)
    changes.feePercent = rateToNumeric(input.feePercent);
  if (input.feeFixed !== undefined)
    changes.feeFixed = centsToNumeric(input.feeFixed);
  if (input.pricingRule !== undefined) changes.pricingRule = input.pricingRule;
  if (input.shippingPriceGross !== undefined)
    changes.shippingPriceGross = centsToNumeric(input.shippingPriceGross);
  if (input.freeShippingFrom !== undefined)
    changes.freeShippingFrom = centsToNumeric(input.freeShippingFrom);
  if (input.defaultPostage !== undefined)
    changes.defaultPostage = centsToNumeric(input.defaultPostage);
  if (input.active !== undefined) changes.active = input.active;

  if (Object.keys(changes).length === 0) {
    // Empty body: return the record unchanged.
    const unchanged = await db.query.channels.findFirst({
      where: eq(schema.channels.id, id),
    });
    return mapChannel(requireFound(unchanged, 'Der Kanal'));
  }

  try {
    const [updated] = await db
      .update(schema.channels)
      .set(changes)
      .where(eq(schema.channels.id, id))
      .returning();
    return mapChannel(requireFound(updated, 'Der Kanal'));
  } catch (error) {
    throw databaseError(error, 'Kanal aendern');
  }
});
