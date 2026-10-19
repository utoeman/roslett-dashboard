import { eq } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { updateColorSchema } from '../../../shared/schemas/master-data.js';
import { readJsonBody, readId, requireFound } from '../../utils/validation.js';
import { conflict, databaseError, isUniqueViolation } from '../../utils/errors.js';

/** The code is part of existing SKUs and is locked once a variant uses it. */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const input = await readJsonBody(event, updateColorSchema);
  const db = useDb();

  const existing = requireFound(
    await db.query.colors.findFirst({ where: eq(schema.colors.id, id) }),
    'Die Farbe',
  );

  if (input.code !== undefined && input.code !== existing.code) {
    const used = await db.query.variants.findFirst({
      where: eq(schema.variants.colorId, id),
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
    const [updated] = await db.update(schema.colors).set(changes).where(eq(schema.colors.id, id)).returning();
    return requireFound(updated, 'Die Farbe');
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict('Dieses Kürzel ist bereits vergeben.', { code: 'Bereits vergeben.' });
    }
    throw databaseError(error, 'Farbe ändern');
  }
});
