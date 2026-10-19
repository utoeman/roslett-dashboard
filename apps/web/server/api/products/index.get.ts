import { and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { listQuerySchema, uuidSchema } from '../../../shared/schemas/common.js';
import { readQuery } from '../../utils/validation.js';
import { mapProduct } from '../../utils/mapping.js';

const querySchema = listQuerySchema.extend({
  categoryId: uuidSchema.optional(),
});

/** Products with category and variants; search covers name and SKU. */
export default defineEventHandler(async (event) => {
  const { search, includeArchived, limit, offset, categoryId } = readQuery(event, querySchema);
  const db = useDb();

  const conditions = [];
  if (!includeArchived) conditions.push(isNull(schema.products.archivedAt));
  if (categoryId) conditions.push(eq(schema.products.categoryId, categoryId));
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        ilike(schema.products.name, pattern),
        sql`exists (
          select 1 from ${schema.variants} v
          where v.product_id = ${schema.products.id} and v.sku ilike ${pattern}
        )`,
      ),
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db.query.products.findMany({
    where,
    orderBy: [asc(schema.products.name)],
    limit,
    offset,
    with: {
      category: true,
      variants: {
        where: includeArchived ? undefined : isNull(schema.variants.archivedAt),
        orderBy: [asc(schema.variants.sku)],
        with: { color: true },
      },
    },
  });

  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.products)
    .where(where);

  return { items: rows.map(mapProduct), total, limit, offset };
});
