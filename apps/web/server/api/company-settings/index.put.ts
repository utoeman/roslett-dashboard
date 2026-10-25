import { schema, useDb } from '../../db/client.js';
import { companySettingsSchema } from '../../../shared/schemas/company.js';
import { readJsonBody, requireFound } from '../../utils/validation.js';
import { databaseError } from '../../utils/errors.js';

/** Creates or replaces the single settings row. */
export default defineEventHandler(async (event) => {
  const input = await readJsonBody(event, companySettingsSchema);
  const values = { ...input, updatedAt: new Date() };
  try {
    const [row] = await useDb()
      .insert(schema.companySettings)
      .values({ id: 1, ...values })
      .onConflictDoUpdate({ target: schema.companySettings.id, set: values })
      .returning();
    return requireFound(row, 'Die Herstellerangaben');
  } catch (error) {
    throw databaseError(error, 'Herstellerangaben speichern');
  }
});
