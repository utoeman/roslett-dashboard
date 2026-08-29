import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, useDb } from '../../db/client.js';
import { flagSchema } from '../../../shared/schemas/gemeinsam.js';
import { leseAbfrage } from '../../utils/validierung.js';
import { bildeKanalAb } from '../../utils/abbildung.js';

const abfrageSchema = z.object({
  nurAktive: flagSchema().default(false),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export default defineEventHandler(async (event) => {
  const { nurAktive, limit, offset } = leseAbfrage(event, abfrageSchema);
  const db = useDb();
  const wo = nurAktive ? eq(schema.kanaele.aktiv, true) : undefined;

  const eintraege = await db.query.kanaele.findMany({
    where: wo,
    orderBy: [asc(schema.kanaele.name)],
    limit,
    offset,
  });

  // Gezaehlt wird in der Datenbank, nicht ueber die Laenge der Seite –
  // sonst waere `anzahl` bei begrenzter Abfrage schlicht falsch.
  const [{ anzahl } = { anzahl: 0 }] = await db
    .select({ anzahl: sql<number>`count(*)::int` })
    .from(schema.kanaele)
    .where(wo);

  return {
    eintraege: eintraege.map(bildeKanalAb),
    anzahl,
    limit,
    offset,
  };
});
