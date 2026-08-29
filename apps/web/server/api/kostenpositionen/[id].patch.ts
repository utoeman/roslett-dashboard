import { eq } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { kostenpositionAendernSchema } from '../../../shared/schemas/kostenposition.js';
import { leseId, leseRumpf, musstExistieren } from '../../utils/validierung.js';
import { datenbankFehler } from '../../utils/errors.js';
import { centZuNumeric, satzZuNumeric } from '../../utils/geld.js';
import { bildeKostenpositionAb } from '../../utils/abbildung.js';

/**
 * Kostenposition aendern.
 *
 * Deaktiviert wird ueber `aktiv: false` – geloescht wird nichts, weil
 * vergangene Kalkulationen sonst nicht mehr nachvollziehbar waeren.
 */
export default defineEventHandler(async (event) => {
  const id = leseId(event);
  const eingabe = await leseRumpf(event, kostenpositionAendernSchema);
  const db = useDb();

  musstExistieren(
    await db.query.kostenpositionen.findFirst({
      where: eq(schema.kostenpositionen.id, id),
      columns: { id: true },
    }),
    'Die Kostenposition',
  );

  const aenderung: Record<string, unknown> = { art: eingabe.art };
  if (eingabe.wert !== undefined) {
    aenderung.wert =
      eingabe.art === 'fix'
        ? centZuNumeric(eingabe.wert)
        : satzZuNumeric(eingabe.wert);
  }
  if (eingabe.bezeichnung !== undefined)
    aenderung.bezeichnung = eingabe.bezeichnung;
  if (eingabe.varianteId !== undefined)
    aenderung.varianteId = eingabe.varianteId;
  if (eingabe.vorsteuerabzugsfaehig !== undefined)
    aenderung.vorsteuerabzugsfaehig = eingabe.vorsteuerabzugsfaehig;
  if (eingabe.aktiv !== undefined) aenderung.aktiv = eingabe.aktiv;
  if (eingabe.verteilmethode !== undefined)
    aenderung.verteilmethode = eingabe.verteilmethode;

  try {
    const [aktualisiert] = await db
      .update(schema.kostenpositionen)
      .set(aenderung)
      .where(eq(schema.kostenpositionen.id, id))
      .returning();
    return bildeKostenpositionAb(aktualisiert!);
  } catch (fehler) {
    throw datenbankFehler(fehler, 'Kostenposition aendern');
  }
});
