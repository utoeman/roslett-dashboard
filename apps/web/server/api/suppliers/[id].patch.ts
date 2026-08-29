import { eq } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { updateSupplierSchema } from '../../../shared/schemas/supplier.js';
import { readJsonBody, readId, requireFound } from '../../utils/validation.js';
import { databaseError } from '../../utils/errors.js';

/**
 * Lieferant aendern oder archivieren.
 *
 * `archivedAt` auf einen Zeitstempel setzen blendet ihn aus den
 * Auswahllisten aus, `null` holt ihn zurueck. Seine Chargen bleiben in
 * beiden Faellen unangetastet.
 */
export default defineEventHandler(async (event) => {
  const id = readId(event);
  const input = await readJsonBody(event, updateSupplierSchema);
  const db = useDb();

  requireFound(
    await db.query.suppliers.findFirst({
      where: eq(schema.suppliers.id, id),
      columns: { id: true },
    }),
    'Der Lieferant',
  );

  const changes: Record<string, unknown> = {};
  if (input.name !== undefined) changes.name = input.name;
  if (input.country !== undefined) changes.country = input.country;
  if (input.note !== undefined) changes.note = input.note;
  if (input.archivedAt !== undefined) changes.archivedAt = input.archivedAt;

  if (Object.keys(changes).length === 0) {
    // Leerer Rumpf: unveraendert zurueckgeben statt einer leeren Antwort.
    return requireFound(
      await db.query.suppliers.findFirst({
        where: eq(schema.suppliers.id, id),
      }),
      'Der Lieferant',
    );
  }

  try {
    const [updated] = await db
      .update(schema.suppliers)
      .set(changes)
      .where(eq(schema.suppliers.id, id))
      .returning();
    return requireFound(updated, 'Der Lieferant');
  } catch (error) {
    throw databaseError(error, 'Lieferant aendern');
  }
});
