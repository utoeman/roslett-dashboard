import { eq } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { updateCategorySchema } from '../../../shared/schemas/master-data.js';
import { readJsonBody, readId, requireFound } from '../../utils/validation.js';
import { conflict, databaseError, isUniqueViolation } from '../../utils/errors.js';

/** The code is part of existing SKUs and is locked once a product uses it. */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const input = await readJsonBody(event, updateCategorySchema);
  const db = useDb();

  const existing = requireFound(
    await db.query.categories.findFirst({ where: eq(schema.categories.id, id) }),
    'Die Kategorie',
  );

  if (input.code !== undefined && input.code !== existing.code) {
    const used = await db.query.products.findFirst({
      where: eq(schema.products.categoryId, id),
      columns: { id: true },
    });
    if (used) {
      throw conflict('Das Kürzel wird schon in SKUs verwendet und kann nicht mehr geändert werden.', {
        code: 'In Verwendung.',
      });
    }
  }

  const changes = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  if (Object.keys(changes).length === 0) return existing;

  try {
    const [updated] = await db.update(schema.categories).set(changes).where(eq(schema.categories.id, id)).returning();
    return requireFound(updated, 'Die Kategorie');
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict('Dieses Kürzel ist bereits vergeben.', { code: 'Bereits vergeben.' });
    }
    throw databaseError(error, 'Kategorie ändern');
  }
});
