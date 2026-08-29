import { eq } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { lieferantAendernSchema } from '../../../shared/schemas/lieferant.js';
import { leseId, leseRumpf, musstExistieren } from '../../utils/validierung.js';
import { datenbankFehler } from '../../utils/errors.js';

/**
 * Lieferant aendern oder archivieren.
 *
 * `archiviertAm` auf einen Zeitstempel setzen blendet ihn aus den
 * Auswahllisten aus, `null` holt ihn zurueck. Seine Chargen bleiben in beiden
 * Faellen unangetastet.
 */
export default defineEventHandler(async (event) => {
  const id = leseId(event);
  const eingabe = await leseRumpf(event, lieferantAendernSchema);
  const db = useDb();

  musstExistieren(
    await db.query.lieferanten.findFirst({
      where: eq(schema.lieferanten.id, id),
      columns: { id: true },
    }),
    'Der Lieferant',
  );

  const aenderung: Record<string, unknown> = {};
  if (eingabe.name !== undefined) aenderung.name = eingabe.name;
  if (eingabe.land !== undefined) aenderung.land = eingabe.land;
  if (eingabe.notiz !== undefined) aenderung.notiz = eingabe.notiz;
  if (eingabe.archiviertAm !== undefined)
    aenderung.archiviertAm = eingabe.archiviertAm;

  if (Object.keys(aenderung).length === 0) {
    // Leerer Rumpf: unveraendert zurueckgeben statt einer leeren Antwort.
    return musstExistieren(
      await db.query.lieferanten.findFirst({
        where: eq(schema.lieferanten.id, id),
      }),
      'Der Lieferant',
    );
  }

  try {
    const [aktualisiert] = await db
      .update(schema.lieferanten)
      .set(aenderung)
      .where(eq(schema.lieferanten.id, id))
      .returning();
    return musstExistieren(aktualisiert, 'Der Lieferant');
  } catch (fehler) {
    throw datenbankFehler(fehler, 'Lieferant aendern');
  }
});
