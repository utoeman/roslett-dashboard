import { and, asc, ilike, isNull, sql } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { listenAbfrageSchema } from '../../../shared/schemas/gemeinsam.js';
import { leseAbfrage } from '../../utils/validierung.js';

export default defineEventHandler(async (event) => {
  const { suche, mitArchivierten, limit, offset } = leseAbfrage(
    event,
    listenAbfrageSchema,
  );
  const db = useDb();

  const bedingungen = [];
  if (!mitArchivierten) {
    bedingungen.push(isNull(schema.lieferanten.archiviertAm));
  }
  if (suche) {
    bedingungen.push(ilike(schema.lieferanten.name, `%${suche}%`));
  }
  const wo = bedingungen.length > 0 ? and(...bedingungen) : undefined;

  const eintraege = await db.query.lieferanten.findMany({
    where: wo,
    orderBy: [asc(schema.lieferanten.name)],
    limit,
    offset,
  });

  const [{ anzahl } = { anzahl: 0 }] = await db
    .select({ anzahl: sql<number>`count(*)::int` })
    .from(schema.lieferanten)
    .where(wo);

  return { eintraege, anzahl, limit, offset };
});
