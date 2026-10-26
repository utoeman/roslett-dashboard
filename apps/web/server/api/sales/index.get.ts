import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { saleQuerySchema } from '../../../shared/schemas/sale.js';
import { readQuery } from '../../utils/validation.js';
import { numericToCents } from '../../utils/money.js';

/** Sales, newest first, with pieces, goods value and open shortfalls. Margins are on the detail view. */
export default defineEventHandler(async (event) => {
  const { search, channelId, status, limit, offset } = readQuery(event, saleQuerySchema);
  const db = useDb();

  const filters: SQL[] = [];
  if (channelId) filters.push(eq(schema.sales.channelId, channelId));
  if (status) filters.push(eq(schema.sales.status, status));
  if (search) {
    const pattern = `%${search}%`;
    filters.push(sql`(${schema.sales.externalOrderNumber} ilike ${pattern} or exists (
      select 1 from sale_items i join variants v on v.id = i.variant_id
      where i.sale_id = sales.id and v.sku ilike ${pattern}))`);
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const rows = await db
    .select({
      id: schema.sales.id,
      channelName: schema.channels.name,
      externalOrderNumber: schema.sales.externalOrderNumber,
      orderedAt: schema.sales.orderedAt,
      deliveryCountry: schema.sales.deliveryCountry,
      status: schema.sales.status,
      pieces: sql<number>`coalesce((select sum(i.quantity) from sale_items i where i.sale_id = sales.id), 0)::int`,
      goodsGross: sql<string>`coalesce((select sum(i.quantity * i.unit_price_gross) from sale_items i where i.sale_id = sales.id), 0)`,
      shortfall: sql<number>`coalesce((
        select -sum(a.quantity) from batch_allocations a
        join stock_entries e on e.id = a.stock_entry_id
        join sale_items i on i.id = e.sale_item_id
        where i.sale_id = sales.id and a.batch_id is null and a.resolved_at is null), 0)::int`,
    })
    .from(schema.sales)
    .leftJoin(schema.channels, eq(schema.channels.id, schema.sales.channelId))
    .where(where)
    .orderBy(desc(schema.sales.orderedAt), desc(schema.sales.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.sales)
    .where(where);

  return {
    items: rows.map(({ goodsGross, ...row }) => ({ ...row, goodsGross: numericToCents(goodsGross) ?? 0 })),
    total,
    limit,
    offset,
  };
});
