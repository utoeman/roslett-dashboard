import { and, asc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, useDb } from '../../db/client.js';
import { listQuerySchema } from '../../../shared/schemas/common.js';
import { readQuery } from '../../utils/validation.js';
import { mapVariant } from '../../utils/mapping.js';

const querySchema = listQuerySchema.extend({
  category: z.string().trim().max(100).optional(),
});

/**
 * Products with variants. Stock is added once the journal exists. Archived
 * entries are hidden unless `includeArchived=true`.
 */
export default defineEventHandler(async (event) => {
  const { search, includeArchived, limit, offset, category } = readQuery(
    event,
    querySchema,
  );
  const db = useDb();

  const conditions = [];
  if (!includeArchived) {
    conditions.push(isNull(schema.products.archivedAt));
  }
  if (category) {
    conditions.push(eq(schema.products.category, category));
  }
  if (search) {
    const pattern = `%${search}%`;
    // Also search by variant SKU.
    conditions.push(
      or(
        ilike(schema.products.name, pattern),
        sql`exists (
          select 1 from ${schema.variants} v
          where v.product_id = ${schema.products.id}
            and (v.sku ilike ${pattern} or v.label ilike ${pattern})
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
      variants: {
        where: includeArchived ? undefined : isNull(schema.variants.archivedAt),
        orderBy: [asc(schema.variants.sku)],
      },
    },
  });

  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.products)
    .where(where);

  return {
    items: rows.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
      archivedAt: product.archivedAt,
      createdAt: product.createdAt,
      variants: product.variants.map(mapVariant),
    })),
    total,
    limit,
    offset,
  };
});
