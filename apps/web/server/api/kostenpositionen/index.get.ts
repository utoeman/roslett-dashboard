import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, useDb } from '../../db/client.js';
import { leseAbfrage } from '../../utils/validierung.js';
import { bildeKostenpositionAb } from '../../utils/abbildung.js';

const abfrageSchema = z.object({
  /** "global" liefert nur die uebergreifenden Positionen. */
  varianteId: z.union([z.uuid(), z.literal('global')]).optional(),
  nurAktive: z.coerce.boolean().default(false),
});

export default defineEventHandler(async (event) => {
  const { varianteId, nurAktive } = leseAbfrage(event, abfrageSchema);
  const db = useDb();

  const bedingungen = [];
  if (varianteId === 'global') {
    bedingungen.push(isNull(schema.kostenpositionen.varianteId));
  } else if (varianteId !== undefined) {
    bedingungen.push(eq(schema.kostenpositionen.varianteId, varianteId));
  }
  if (nurAktive) {
    bedingungen.push(eq(schema.kostenpositionen.aktiv, true));
  }

  const eintraege = await db.query.kostenpositionen.findMany({
    where: bedingungen.length > 0 ? and(...bedingungen) : undefined,
    orderBy: [asc(schema.kostenpositionen.bezeichnung)],
  });

  return {
    eintraege: eintraege.map(bildeKostenpositionAb),
  };
});
