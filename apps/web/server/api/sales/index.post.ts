import { and, eq, inArray } from 'drizzle-orm';
import {
  SalesError,
  StockError,
  flatFee,
  orderTotalGross,
  planIssue,
  shippingRevenueFor,
  type SaleLine,
} from '@roslett/core';
import { schema, useDb } from '../../db/client.js';
import { createSaleSchema } from '../../../shared/schemas/sale.js';
import { readJsonBody } from '../../utils/validation.js';
import { badRequest, conflict, databaseError, isUniqueViolation } from '../../utils/errors.js';
import { centsToNumeric, numericToCents, numericToRate, rateToNumeric } from '../../utils/money.js';
import { batchStock, postEntry } from '../../utils/stock.js';
import { vatRateFor } from '../../utils/sales.js';

/**
 * Manual sale: one `sale` entry per line, issued FIFO; missing stock is booked
 * as a shortfall with a warning (E8). Shipping, postage and the flat fee
 * default from the channel.
 */
export default defineEventHandler(async (event) => {
  const input = await readJsonBody(event, createSaleSchema);
  const db = useDb();

  const channel = await db.query.channels.findFirst({ where: eq(schema.channels.id, input.channelId) });
  if (channel === undefined || !channel.active) {
    throw badRequest('Den Kanal gibt es nicht oder er ist inaktiv.', { channelId: 'Kanal nicht verfügbar.' });
  }
  const duplicate = await db.query.sales.findFirst({
    where: and(
      eq(schema.sales.channelId, input.channelId),
      eq(schema.sales.externalOrderNumber, input.externalOrderNumber),
    ),
    columns: { id: true },
  });
  if (duplicate) {
    throw conflict('Diese Bestellnummer ist für den Kanal schon erfasst.', { externalOrderNumber: 'Gibt es schon.' });
  }

  const variants = await db.query.variants.findMany({
    where: inArray(schema.variants.id, [...new Set(input.items.map((i) => i.variantId))]),
    columns: { id: true, sku: true, archivedAt: true },
    with: { product: { columns: { vatCategory: true } } },
  });

  const lines: (SaleLine & { variantId: string; sku: string })[] = [];
  for (const [index, item] of input.items.entries()) {
    const variant = variants.find((v) => v.id === item.variantId);
    if (variant === undefined || variant.archivedAt !== null) {
      throw badRequest('Eine Variante gibt es nicht oder sie ist archiviert.', {
        [`items.${index}.variantId`]: 'Variante nicht verfügbar.',
      });
    }
    const vatRate = await vatRateFor(db, input.deliveryCountry, variant.product.vatCategory, input.orderedAt);
    if (vatRate === null) {
      throw badRequest(`Für ${input.deliveryCountry} ist kein MwSt-Satz hinterlegt.`, {
        deliveryCountry: 'Kein MwSt-Satz hinterlegt.',
      });
    }
    lines.push({ ...item, id: String(index), sku: variant.sku, vatRate, costOfGoodsEur: 0, unitCostItemsEur: 0 });
  }

  const goodsGross = lines.reduce((total, l) => total + l.quantity * l.unitPriceGross, 0);
  if (input.discountGross > goodsGross) {
    throw badRequest('Der Rabatt ist höher als der Warenwert.', { discountGross: 'Zu hoch.' });
  }
  const shippingRevenueGross =
    input.shippingRevenueGross ??
    shippingRevenueFor(
      {
        shippingPriceGross: numericToCents(channel.shippingPriceGross) ?? 0,
        freeShippingFrom: numericToCents(channel.freeShippingFrom),
      },
      goodsGross,
    );
  const postageCost = input.postageCost ?? numericToCents(channel.defaultPostage) ?? 0;
  const fee = flatFee(
    { feePercent: numericToRate(channel.feePercent) ?? 0, feeFixed: numericToCents(channel.feeFixed) ?? 0 },
    orderTotalGross(lines, input.discountGross, shippingRevenueGross),
  );

  try {
    const result = await db.transaction(async (tx) => {
      const [sale] = await tx
        .insert(schema.sales)
        .values({
          channelId: channel.id,
          externalOrderNumber: input.externalOrderNumber,
          orderedAt: new Date(`${input.orderedAt}T12:00:00Z`),
          deliveryCountry: input.deliveryCountry,
          shippingRevenueGross: centsToNumeric(shippingRevenueGross) ?? '0',
          postageCost: centsToNumeric(postageCost) ?? '0',
          discountGross: centsToNumeric(input.discountGross) ?? '0',
        })
        .returning({ id: schema.sales.id });
      if (!sale) throw new Error('Verkauf konnte nicht angelegt werden.');

      const warnings: string[] = [];
      for (const line of lines) {
        const [item] = await tx
          .insert(schema.saleItems)
          .values({
            saleId: sale.id,
            variantId: line.variantId,
            quantity: line.quantity,
            unitPriceGross: centsToNumeric(line.unitPriceGross) ?? '0',
            vatRate: rateToNumeric(line.vatRate) ?? '0',
          })
          .returning({ id: schema.saleItems.id });
        if (!item) throw new Error('Position konnte nicht angelegt werden.');

        const allocations = planIssue(await batchStock(tx, line.variantId), line.quantity);
        await postEntry(tx, {
          variantId: line.variantId,
          kind: 'sale',
          quantity: -line.quantity,
          postedAt: input.orderedAt,
          saleItemId: item.id,
          allocations,
        });
        const missing = -allocations.filter((a) => a.batchId === null).reduce((total, a) => total + a.quantity, 0);
        if (missing > 0) warnings.push(`${line.sku}: ${missing} Stück ohne Bestand gebucht (Fehlmenge).`);
      }

      if (fee !== 0) {
        await tx
          .insert(schema.fees)
          .values({ saleId: sale.id, kind: 'transaction', amount: centsToNumeric(fee) ?? '0', source: 'flat' });
      }
      return { id: sale.id, warnings };
    });
    setResponseStatus(event, 201);
    return result;
  } catch (error) {
    if (error instanceof StockError || error instanceof SalesError) throw badRequest(error.message);
    if (isUniqueViolation(error)) {
      throw conflict('Diese Bestellnummer ist für den Kanal schon erfasst.', { externalOrderNumber: 'Gibt es schon.' });
    }
    throw databaseError(error, 'Verkauf erfassen');
  }
});
