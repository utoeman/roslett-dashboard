import { schema, useDb } from '../../db/client.js';
import { createSupplierSchema } from '../../../shared/schemas/supplier.js';
import { readBody, requireFound } from '../../utils/validation.js';
import { databaseError } from '../../utils/errors.js';

export default defineEventHandler(async (event) => {
  const input = await readBody(event, createSupplierSchema);
  try {
    const [supplier] = await useDb()
      .insert(schema.suppliers)
      .values({
        name: input.name,
        country: input.country ?? null,
        note: input.note ?? null,
      })
      .returning();
    setResponseStatus(event, 201);
    return requireFound(supplier, 'Der Lieferant');
  } catch (error) {
    throw databaseError(error, 'Lieferant anlegen');
  }
});
