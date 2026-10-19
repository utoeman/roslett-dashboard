import { asc, isNull, sql } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { listQuerySchema } from '../../../shared/schemas/common.js';
import { readQuery } from '../../utils/validation.js';

export default defineEventHandler(async (event) => {
  const { includeArchived } = readQuery(event, listQuerySchema.pick({ includeArchived: true }));

  const items = await useDb()
    .select({
      id: schema.categories.id,
      code: schema.categories.code,
      name: schema.categories.name,
      group: schema.categories.group,
      archivedAt: schema.categories.archivedAt,
      // Qualified on purpose: an unqualified "id" would bind to the subquery's table.
      inUse: sql<boolean>`exists (select 1 from products p where p.category_id = categories.id)`,
    })
    .from(schema.categories)
    .where(includeArchived ? undefined : isNull(schema.categories.archivedAt))
    .orderBy(asc(schema.categories.code));

  return { items, total: items.length };
});
