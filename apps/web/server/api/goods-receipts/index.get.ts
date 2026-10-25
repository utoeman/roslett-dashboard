import { desc, sql } from 'drizzle-orm';
import { deliveryState } from '@roslett/core';
import { schema, useDb } from '../../db/client.js';
import { listQuerySchema } from '../../../shared/schemas/common.js';
import { readQuery } from '../../utils/validation.js';
import { numericToCents } from '../../utils/money.js';

/** Receipts, newest invoice first, with ordered/delivered quantities and goods value. */
export default defineEventHandler(async (event) => {
  const { limit, offset } = readQuery(event, listQuerySchema.pick({ limit: true, offset: true }));
  const db = useDb();

  const rows = await db
    .select({
      id: schema.goodsReceipts.id,
      kind: schema.goodsReceipts.kind,
      number: schema.goodsReceipts.number,
      supplierName: schema.suppliers.name,
      invoiceNumber: schema.goodsReceipts.invoiceNumber,
      invoiceDate: schema.goodsReceipts.invoiceDate,
      currency: schema.goodsReceipts.currency,
      state: schema.goodsReceipts.state,
      positions: sql<number>`(select count(*) from batches b where b.goods_receipt_id = goods_receipts.id)::int`,
      ordered: sql<number>`coalesce((select sum(b.quantity_ordered) from batches b where b.goods_receipt_id = goods_receipts.id), 0)::int`,
      delivered: sql<number>`coalesce((
        select sum(least(d.delivered, d.quantity_ordered)) from (
          select b.quantity_ordered, coalesce((
            select sum(a.quantity) from batch_allocations a join stock_entries e on e.id = a.stock_entry_id
            where a.batch_id = b.id and (e.kind = 'goods_receipt' or exists (
              select 1 from stock_entries o where o.id = e.reverses_id and o.kind = 'goods_receipt'))
          ), 0) as delivered
          from batches b where b.goods_receipt_id = goods_receipts.id
        ) d), 0)::int`,
      goodsValueEur: sql<string>`coalesce((select sum(b.unit_price_eur * b.quantity_ordered) from batches b where b.goods_receipt_id = goods_receipts.id), 0)`,
    })
    .from(schema.goodsReceipts)
    .innerJoin(schema.suppliers, sql`${schema.suppliers.id} = ${schema.goodsReceipts.supplierId}`)
    .orderBy(desc(schema.goodsReceipts.invoiceDate), desc(schema.goodsReceipts.number))
    .limit(limit)
    .offset(offset);

  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.goodsReceipts);

  return {
    items: rows.map(({ goodsValueEur, ...row }) => ({
      ...row,
      goodsValueEur: numericToCents(goodsValueEur) ?? 0,
      deliveryState: deliveryState(row.ordered, row.delivered),
    })),
    total,
    limit,
    offset,
  };
});
