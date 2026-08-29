import { eq } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { kostenpositionAendernSchema } from '../../../shared/schemas/kostenposition.js';
import { leseId, leseRumpf, musstExistieren } from '../../utils/validierung.js';
import { datenbankFehler, ungueltig } from '../../utils/errors.js';
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

  const bestehend = musstExistieren(
    await db.query.kostenpositionen.findFirst({
      where: eq(schema.kostenpositionen.id, id),
      columns: { id: true, art: true },
    }),
    'Die Kostenposition',
  );

  /*
   * Ein Wechsel der Art ohne neuen Wert wuerde die gespeicherte Zahl
   * stillschweigend umdeuten: aus "prozent 0.0470" (4,7 Prozent) wuerde
   * "fix 0.0470", gelesen als 5 Cent. Deshalb verlangen wir bei einem
   * Artwechsel ausdruecklich einen neuen Wert.
   */
  if (eingabe.art !== bestehend.art && eingabe.wert === undefined) {
    throw ungueltig(
      'Beim Wechsel zwischen Fixbetrag und Prozentsatz muss der Wert neu angegeben werden.',
      { wert: 'Wert erforderlich.' },
    );
  }

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
    return bildeKostenpositionAb(
      musstExistieren(aktualisiert, 'Die Kostenposition'),
    );
  } catch (fehler) {
    throw datenbankFehler(fehler, 'Kostenposition aendern');
  }
});
