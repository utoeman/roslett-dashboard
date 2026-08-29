import { asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { schema, useDb } from '../../db/client.js';
import { leseId, musstExistieren } from '../../utils/validierung.js';
import { bildeKostenpositionAb, bildeVarianteAb } from '../../utils/abbildung.js';

/**
 * Artikel im Detail.
 *
 * Liefert das Produkt mit allen Varianten – archivierte eingeschlossen, damit
 * die Detailansicht die vollstaendige Historie zeigt – sowie die
 * Kostenpositionen, die fuer diesen Artikel gelten: die globalen und die
 * variantenspezifischen.
 */
export default defineEventHandler(async (event) => {
  const id = leseId(event);
  const db = useDb();

  const produkt = musstExistieren(
    await db.query.produkte.findFirst({
      where: eq(schema.produkte.id, id),
      with: {
        varianten: { orderBy: [asc(schema.varianten.sku)] },
      },
    }),
    'Der Artikel',
  );

  const variantenIds = produkt.varianten.map((v) => v.id);

  // Globale Positionen gelten immer, variantenspezifische nur fuer die
  // Varianten dieses Produkts.
  const kostenpositionen = await db.query.kostenpositionen.findMany({
    where:
      variantenIds.length > 0
        ? or(
            isNull(schema.kostenpositionen.varianteId),
            inArray(schema.kostenpositionen.varianteId, variantenIds),
          )
        : isNull(schema.kostenpositionen.varianteId),
    orderBy: [asc(schema.kostenpositionen.bezeichnung)],
  });

  return {
    id: produkt.id,
    name: produkt.name,
    beschreibung: produkt.beschreibung,
    kategorie: produkt.kategorie,
    archiviertAm: produkt.archiviertAm,
    erstelltAm: produkt.erstelltAm,
    varianten: produkt.varianten.map(bildeVarianteAb),
    kostenpositionen: kostenpositionen.map(bildeKostenpositionAb),
  };
});
