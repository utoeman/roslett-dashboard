import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, useDb } from '../../db/client.js';
import { flagSchema } from '../../../shared/schemas/common.js';
import { readQuery } from '../../utils/validation.js';
import { mapChannel } from '../../utils/mapping.js';

const querySchema = z.object({
  activeOnly: flagSchema().default(false),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export default defineEventHandler(async (event) => {
  const { activeOnly, limit, offset } = readQuery(event, querySchema);
  const db = useDb();
  const where = activeOnly ? eq(schema.channels.active, true) : undefined;

  const items = await db.query.channels.findMany({
    where,
    orderBy: [asc(schema.channels.name)],
    limit,
    offset,
  });

  // Count in the database; the page length would be wrong with a limit.
  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.channels)
    .where(where);

  return { items: items.map(mapChannel), total, limit, offset };
});
