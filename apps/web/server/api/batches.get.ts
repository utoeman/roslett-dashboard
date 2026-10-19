import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { schema, useDb } from '../db/client.js';
import { uuidSchema } from '../../shared/schemas/common.js';
import { readQuery } from '../utils/validation.js';
import { batchStock } from '../utils/stock.js';

const querySchema = z.object({ variantId: uuidSchema });

/** Batches of a variant with remaining stock and receipt number, oldest first (for returns). */
export default defineEventHandler(async (event) => {
  const { variantId } = readQuery(event, querySchema);
  const db = useDb();

  const stock = await batchStock(db, variantId);
  const batches =
    stock.length > 0
      ? await db.query.batches.findMany({
          where: inArray(
            schema.batches.id,
            stock.map((b) => b.id),
          ),
          with: { goodsReceipt: { columns: { number: true } } },
        })
      : [];

  return {
    items: stock
      .map((b) => ({
        id: b.id,
        receiptNumber: batches.find((x) => x.id === b.id)?.goodsReceipt.number ?? null,
        invoiceDate: b.invoiceDate,
        remaining: b.remaining,
      }))
      .sort((a, b) => (a.invoiceDate < b.invoiceDate ? -1 : a.invoiceDate > b.invoiceDate ? 1 : 0)),
  };
});
