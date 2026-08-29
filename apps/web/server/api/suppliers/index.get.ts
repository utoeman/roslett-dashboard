import { and, asc, ilike, isNull, sql } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { listQuerySchema } from '../../../shared/schemas/common.js';
import { readQuery } from '../../utils/validation.js';

export default defineEventHandler(async (event) => {
  const { search, includeArchived, limit, offset } = readQuery(
    event,
    listQuerySchema,
  );
  const db = useDb();

  const conditions = [];
  if (!includeArchived) {
    conditions.push(isNull(schema.suppliers.archivedAt));
  }
  if (search) {
    conditions.push(ilike(schema.suppliers.name, `%${search}%`));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const items = await db.query.suppliers.findMany({
    where,
    orderBy: [asc(schema.suppliers.name)],
    limit,
    offset,
  });

  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.suppliers)
    .where(where);

  return { items, total, limit, offset };
});
