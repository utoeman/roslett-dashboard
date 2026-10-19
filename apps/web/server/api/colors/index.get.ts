import { asc, isNull, sql } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { listQuerySchema } from '../../../shared/schemas/common.js';
import { readQuery } from '../../utils/validation.js';

export default defineEventHandler(async (event) => {
  const { includeArchived } = readQuery(event, listQuerySchema.pick({ includeArchived: true }));

  const items = await useDb()
    .select({
      id: schema.colors.id,
      code: schema.colors.code,
      name: schema.colors.name,
      archivedAt: schema.colors.archivedAt,
      // Qualified on purpose: an unqualified "id" would bind to the subquery's table.
      inUse: sql<boolean>`exists (select 1 from variants v where v.color_id = colors.id)`,
    })
    .from(schema.colors)
    .where(includeArchived ? undefined : isNull(schema.colors.archivedAt))
    .orderBy(asc(schema.colors.code));

  return { items, total: items.length };
});
