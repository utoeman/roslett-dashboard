import { asc, desc } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { mapVatRate } from '../../utils/mapping.js';

export default defineEventHandler(async () => {
  const rows = await useDb().query.vatRates.findMany({
    orderBy: [asc(schema.vatRates.country), asc(schema.vatRates.vatCategory), desc(schema.vatRates.validFrom)],
  });
  const items = rows.map(mapVatRate);
  return { items, total: items.length };
});
