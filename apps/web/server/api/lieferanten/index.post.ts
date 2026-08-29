import { schema, useDb } from '../../db/client.js';
import { lieferantAnlegenSchema } from '../../../shared/schemas/lieferant.js';
import { leseRumpf } from '../../utils/validierung.js';
import { datenbankFehler } from '../../utils/errors.js';

export default defineEventHandler(async (event) => {
  const eingabe = await leseRumpf(event, lieferantAnlegenSchema);
  try {
    const [lieferant] = await useDb()
      .insert(schema.lieferanten)
      .values({
        name: eingabe.name,
        land: eingabe.land ?? null,
        notiz: eingabe.notiz ?? null,
      })
      .returning();
    setResponseStatus(event, 201);
    return lieferant;
  } catch (fehler) {
    throw datenbankFehler(fehler, 'Lieferant anlegen');
  }
});
