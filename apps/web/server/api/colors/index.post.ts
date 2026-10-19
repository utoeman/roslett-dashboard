import { schema, useDb } from '../../db/client.js';
import { createColorSchema } from '../../../shared/schemas/master-data.js';
import { readJsonBody, requireFound } from '../../utils/validation.js';
import { conflict, databaseError, isUniqueViolation } from '../../utils/errors.js';

export default defineEventHandler(async (event) => {
  const input = await readJsonBody(event, createColorSchema);
  try {
    const [color] = await useDb().insert(schema.colors).values(input).returning();
    setResponseStatus(event, 201);
    return requireFound(color, 'Die Farbe');
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict('Dieses Kürzel ist bereits vergeben.', { code: 'Bereits vergeben.' });
    }
    throw databaseError(error, 'Farbe anlegen');
  }
});
