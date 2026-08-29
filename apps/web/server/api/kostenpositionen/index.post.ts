import { schema, useDb } from '../../db/client.js';
import { kostenpositionAnlegenSchema } from '../../../shared/schemas/kostenposition.js';
import { leseRumpf, musstExistieren } from '../../utils/validierung.js';
import { datenbankFehler } from '../../utils/errors.js';
import { centZuNumeric, satzZuNumeric } from '../../utils/geld.js';
import { bildeKostenpositionAb } from '../../utils/abbildung.js';

/**
 * Kostenposition anlegen.
 *
 * Der Wert wird je nach Art unterschiedlich abgelegt: ein Fixbetrag als
 * Euro-Wert, ein Prozentsatz als Dezimalsatz. Das Schema hat ihn bereits
 * entsprechend geparst, hier folgt nur noch die Umrechnung fuer die Spalte.
 */
export default defineEventHandler(async (event) => {
  const eingabe = await leseRumpf(event, kostenpositionAnlegenSchema);
  try {
    const [position] = await useDb()
      .insert(schema.kostenpositionen)
      .values({
        varianteId: eingabe.varianteId ?? null,
        bezeichnung: eingabe.bezeichnung,
        art: eingabe.art,
        wert:
          eingabe.art === 'fix'
            ? (centZuNumeric(eingabe.wert) ?? '0')
            : (satzZuNumeric(eingabe.wert) ?? '0'),
        vorsteuerabzugsfaehig: eingabe.vorsteuerabzugsfaehig,
        aktiv: eingabe.aktiv,
        verteilmethode: eingabe.verteilmethode,
      })
      .returning();
    setResponseStatus(event, 201);
    return bildeKostenpositionAb(musstExistieren(position, 'Die Kostenposition'));
  } catch (fehler) {
    throw datenbankFehler(fehler, 'Kostenposition anlegen');
  }
});
