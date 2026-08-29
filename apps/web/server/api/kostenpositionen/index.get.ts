import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, useDb } from '../../db/client.js';
import { flagSchema } from '../../../shared/schemas/gemeinsam.js';
import { leseAbfrage } from '../../utils/validierung.js';
import { bildeKostenpositionAb } from '../../utils/abbildung.js';

const abfrageSchema = z.object({
  /** "global" liefert nur die uebergreifenden Positionen. */
  varianteId: z.union([z.uuid(), z.literal('global')]).optional(),
  nurAktive: flagSchema().default(false),
  // Wie bei den uebrigen Listen begrenzt: die Zahl der Positionen waechst
  // mit dem Artikelstamm, weil sie variantenspezifisch sein koennen.
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export default defineEventHandler(async (event) => {
  const { varianteId, nurAktive, limit, offset } = leseAbfrage(
    event,
    abfrageSchema,
  );
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

  const wo = bedingungen.length > 0 ? and(...bedingungen) : undefined;

  const eintraege = await db.query.kostenpositionen.findMany({
    where: wo,
    orderBy: [asc(schema.kostenpositionen.bezeichnung)],
    limit,
    offset,
  });

  const [{ anzahl } = { anzahl: 0 }] = await db
    .select({ anzahl: sql<number>`count(*)::int` })
    .from(schema.kostenpositionen)
    .where(wo);

  return {
    eintraege: eintraege.map(bildeKostenpositionAb),
    anzahl,
    limit,
    offset,
  };
});
