import { eq } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { updateVatRateSchema } from '../../../shared/schemas/master-data.js';
import { readJsonBody, readId, requireFound } from '../../utils/validation.js';
import { conflict, databaseError, isUniqueViolation } from '../../utils/errors.js';
import { rateToNumeric } from '../../utils/money.js';
import { mapVatRate } from '../../utils/mapping.js';

/** Corrects a rate; for a legal change add a new row with a later date instead. */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const input = await readJsonBody(event, updateVatRateSchema);
  const db = useDb();

  const existing = requireFound(
    await db.query.vatRates.findFirst({ where: eq(schema.vatRates.id, id) }),
    'Der MwSt-Satz',
  );

  const changes: Record<string, unknown> = {};
  if (input.rate !== undefined) changes.rate = rateToNumeric(input.rate);
  if (input.validFrom !== undefined) changes.validFrom = input.validFrom;
  if (Object.keys(changes).length === 0) return mapVatRate(existing);

  try {
    const [updated] = await db.update(schema.vatRates).set(changes).where(eq(schema.vatRates.id, id)).returning();
    return mapVatRate(requireFound(updated, 'Der MwSt-Satz'));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict('Für dieses Land, diese Kategorie und dieses Datum gibt es schon einen Satz.', {
        validFrom: 'Bereits vorhanden.',
      });
    }
    throw databaseError(error, 'MwSt-Satz ändern');
  }
});
