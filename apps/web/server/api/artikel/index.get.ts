import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, useDb } from '../../db/client.js';
import { listenAbfrageSchema } from '../../../shared/schemas/gemeinsam.js';
import { leseAbfrage } from '../../utils/validierung.js';
import { bildeKostenpositionAb, bildeVarianteAb } from '../../utils/abbildung.js';

const abfrageSchema = listenAbfrageSchema.extend({
  kategorie: z.string().trim().max(100).optional(),
});

/**
 * Artikelliste.
 *
 * Liefert Produkte samt ihrer Varianten. Der Bestand fehlt bewusst: er ergibt
 * sich aus dem Buchungsjournal (Regel 8) und kommt in Phase 3 dazu, wenn es
 * Buchungen gibt.
 *
 * Archivierte Eintraege bleiben standardmaessig ausgeblendet, lassen sich aber
 * ueber `mitArchivierten=true` einblenden – geloescht wird nichts.
 */
export default defineEventHandler(async (event) => {
  const { suche, mitArchivierten, limit, offset, kategorie } = leseAbfrage(
    event,
    abfrageSchema,
  );
  const db = useDb();

  const bedingungen = [];
  if (!mitArchivierten) {
    bedingungen.push(isNull(schema.produkte.archiviertAm));
  }
  if (kategorie) {
    bedingungen.push(eq(schema.produkte.kategorie, kategorie));
  }
  if (suche) {
    const muster = `%${suche}%`;
    // Auch ueber die SKU der Varianten suchen: danach sucht man im Alltag
    // haeufiger als nach dem Produktnamen.
    bedingungen.push(
      or(
        ilike(schema.produkte.name, muster),
        sql`exists (
          select 1 from ${schema.varianten} v
          where v.produkt_id = ${schema.produkte.id}
            and (v.sku ilike ${muster} or v.bezeichnung ilike ${muster})
        )`,
      ),
    );
  }

  const wo = bedingungen.length > 0 ? and(...bedingungen) : undefined;

  const zeilen = await db.query.produkte.findMany({
    where: wo,
    orderBy: [asc(schema.produkte.name)],
    limit,
    offset,
    with: {
      varianten: {
        where: mitArchivierten ? undefined : isNull(schema.varianten.archiviertAm),
        orderBy: [asc(schema.varianten.sku)],
      },
    },
  });

  const [{ anzahl } = { anzahl: 0 }] = await db
    .select({ anzahl: sql<number>`count(*)::int` })
    .from(schema.produkte)
    .where(wo);

  return {
    eintraege: zeilen.map((p) => ({
      id: p.id,
      name: p.name,
      beschreibung: p.beschreibung,
      kategorie: p.kategorie,
      archiviertAm: p.archiviertAm,
      erstelltAm: p.erstelltAm,
      varianten: p.varianten.map(bildeVarianteAb),
    })),
    anzahl,
    limit,
    offset,
  };
});
