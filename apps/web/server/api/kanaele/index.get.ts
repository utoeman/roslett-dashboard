import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema, useDb } from '../../db/client.js';
import { flagSchema } from '../../../shared/schemas/gemeinsam.js';
import { leseAbfrage } from '../../utils/validierung.js';
import { bildeKanalAb } from '../../utils/abbildung.js';

const abfrageSchema = z.object({
  nurAktive: flagSchema(false),
});

export default defineEventHandler(async (event) => {
  const { nurAktive } = leseAbfrage(event, abfrageSchema);
  const db = useDb();
  const wo = nurAktive ? eq(schema.kanaele.aktiv, true) : undefined;

  const eintraege = await db.query.kanaele.findMany({
    where: wo,
    orderBy: [asc(schema.kanaele.name)],
  });

  return {
    eintraege: eintraege.map(bildeKanalAb),
    anzahl: eintraege.length,
  };
});
