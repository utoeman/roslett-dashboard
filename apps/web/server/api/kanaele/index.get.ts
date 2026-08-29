import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema, useDb } from '../../db/client.js';
import { leseAbfrage } from '../../utils/validierung.js';
import { bildeKanalAb } from '../../utils/abbildung.js';

const abfrageSchema = z.object({
  nurAktive: z.coerce.boolean().default(false),
});

export default defineEventHandler(async (event) => {
  const { nurAktive } = leseAbfrage(event, abfrageSchema);
  const eintraege = await useDb().query.kanaele.findMany({
    where: nurAktive ? eq(schema.kanaele.aktiv, true) : undefined,
    orderBy: [asc(schema.kanaele.name)],
  });

  return {
    eintraege: eintraege.map(bildeKanalAb),
  };
});
