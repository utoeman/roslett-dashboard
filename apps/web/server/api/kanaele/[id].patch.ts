import { eq } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { kanalAendernSchema } from '../../../shared/schemas/kanal.js';
import { leseId, leseRumpf, musstExistieren } from '../../utils/validierung.js';
import { datenbankFehler } from '../../utils/errors.js';
import { centZuNumeric, satzZuNumeric } from '../../utils/geld.js';
import { bildeKanalAb } from '../../utils/abbildung.js';

export default defineEventHandler(async (event) => {
  const id = leseId(event);
  const eingabe = await leseRumpf(event, kanalAendernSchema);
  const db = useDb();

  musstExistieren(
    await db.query.kanaele.findFirst({
      where: eq(schema.kanaele.id, id),
      columns: { id: true },
    }),
    'Der Kanal',
  );

  const aenderung: Record<string, unknown> = {};
  if (eingabe.name !== undefined) aenderung.name = eingabe.name;
  if (eingabe.gebuehrProzent !== undefined)
    aenderung.gebuehrProzent = satzZuNumeric(eingabe.gebuehrProzent);
  if (eingabe.gebuehrFix !== undefined)
    aenderung.gebuehrFix = centZuNumeric(eingabe.gebuehrFix);
  if (eingabe.preisregel !== undefined) aenderung.preisregel = eingabe.preisregel;
  if (eingabe.aktiv !== undefined) aenderung.aktiv = eingabe.aktiv;

  if (Object.keys(aenderung).length === 0) {
    // Ein leerer Rumpf ist kein Fehler: der Datensatz wird unveraendert
    // zurueckgegeben. Ohne musstExistieren waere die Antwort ein leeres
    // 200 statt einer 404, falls der Satz zwischenzeitlich verschwindet.
    const unveraendert = await db.query.kanaele.findFirst({
      where: eq(schema.kanaele.id, id),
    });
    return bildeKanalAb(musstExistieren(unveraendert, 'Der Kanal'));
  }

  try {
    const [aktualisiert] = await db
      .update(schema.kanaele)
      .set(aenderung)
      .where(eq(schema.kanaele.id, id))
      .returning();
    return bildeKanalAb(musstExistieren(aktualisiert, 'Der Kanal'));
  } catch (fehler) {
    throw datenbankFehler(fehler, 'Kanal aendern');
  }
});
