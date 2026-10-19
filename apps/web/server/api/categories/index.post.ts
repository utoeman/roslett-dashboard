import { schema, useDb } from '../../db/client.js';
import { createCategorySchema } from '../../../shared/schemas/master-data.js';
import { readJsonBody, requireFound } from '../../utils/validation.js';
import { conflict, databaseError, isUniqueViolation } from '../../utils/errors.js';

export default defineEventHandler(async (event) => {
  const input = await readJsonBody(event, createCategorySchema);
  try {
    const [category] = await useDb().insert(schema.categories).values(input).returning();
    setResponseStatus(event, 201);
    return requireFound(category, 'Die Kategorie');
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict('Dieses Kürzel ist bereits vergeben.', { code: 'Bereits vergeben.' });
    }
    throw databaseError(error, 'Kategorie anlegen');
  }
});
