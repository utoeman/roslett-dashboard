import { schema, useDb } from '../../db/client.js';
import { createVatRateSchema } from '../../../shared/schemas/master-data.js';
import { readJsonBody, requireFound } from '../../utils/validation.js';
import { conflict, databaseError, isUniqueViolation } from '../../utils/errors.js';
import { rateToNumeric } from '../../utils/money.js';
import { mapVatRate } from '../../utils/mapping.js';

/** A rate change is a new row with a later `validFrom`, so history stays intact. */
export default defineEventHandler(async (event) => {
  const input = await readJsonBody(event, createVatRateSchema);
  try {
    const [row] = await useDb()
      .insert(schema.vatRates)
      .values({ ...input, rate: rateToNumeric(input.rate) ?? '0' })
      .returning();
    setResponseStatus(event, 201);
    return mapVatRate(requireFound(row, 'Der MwSt-Satz'));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict('Für dieses Land, diese Kategorie und dieses Datum gibt es schon einen Satz.', {
        validFrom: 'Bereits vorhanden.',
      });
    }
    throw databaseError(error, 'MwSt-Satz anlegen');
  }
});
