import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, useDb } from '../../db/client.js';
import { flagSchema } from '../../../shared/schemas/common.js';
import { readQuery } from '../../utils/validation.js';
import { mapCostItem } from '../../utils/mapping.js';

const querySchema = z.object({
  /** "global" returns only global items. */
  variantId: z.union([z.uuid(), z.literal('global')]).optional(),
  activeOnly: flagSchema().default(false),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export default defineEventHandler(async (event) => {
  const { variantId, activeOnly, limit, offset } = readQuery(event, querySchema);
  const db = useDb();

  const conditions = [];
  if (variantId === 'global') {
    conditions.push(isNull(schema.costItems.variantId));
  } else if (variantId !== undefined) {
    conditions.push(eq(schema.costItems.variantId, variantId));
  }
  if (activeOnly) {
    conditions.push(eq(schema.costItems.active, true));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const items = await db.query.costItems.findMany({
    where,
    orderBy: [asc(schema.costItems.label)],
    limit,
    offset,
  });

  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.costItems)
    .where(where);

  return { items: items.map(mapCostItem), total, limit, offset };
});
