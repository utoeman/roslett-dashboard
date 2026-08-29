import { schema, useDb } from '../../db/client.js';
import { kanalAnlegenSchema } from '../../../shared/schemas/kanal.js';
import { leseRumpf, musstExistieren } from '../../utils/validierung.js';
import { datenbankFehler } from '../../utils/errors.js';
import { centZuNumeric, satzZuNumeric } from '../../utils/geld.js';
import { bildeKanalAb } from '../../utils/abbildung.js';

export default defineEventHandler(async (event) => {
  const eingabe = await leseRumpf(event, kanalAnlegenSchema);
  try {
    const [kanal] = await useDb()
      .insert(schema.kanaele)
      .values({
        name: eingabe.name,
        gebuehrProzent: satzZuNumeric(eingabe.gebuehrProzent) ?? '0',
        gebuehrFix: centZuNumeric(eingabe.gebuehrFix) ?? '0',
        preisregel: eingabe.preisregel,
        aktiv: eingabe.aktiv,
      })
      .returning();
    setResponseStatus(event, 201);
    return bildeKanalAb(musstExistieren(kanal, 'Der Kanal'));
  } catch (fehler) {
    throw datenbankFehler(fehler, 'Kanal anlegen');
  }
});
