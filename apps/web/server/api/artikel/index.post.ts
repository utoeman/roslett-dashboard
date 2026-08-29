import { schema, useDb } from '../../db/client.js';
import { produktAnlegenSchema } from '../../../shared/schemas/artikel.js';
import { leseRumpf } from '../../utils/validierung.js';
import { datenbankFehler, ungueltig } from '../../utils/errors.js';
import { centZuNumeric, satzZuNumeric } from '../../utils/geld.js';
import { bildeVarianteAb } from '../../utils/abbildung.js';

/**
 * Artikel anlegen.
 *
 * Ein Produkt bekommt immer mindestens eine Variante. Werden keine
 * uebergeben, legt die Route selbst eine Standardvariante an – der haeufige
 * Fall eines Artikels ohne Ausfuehrungen kostet den Nutzer damit keinen
 * zusaetzlichen Schritt, und nachgelagerter Code muss nie ein Produkt ohne
 * Variante behandeln.
 *
 * Produkt und Varianten entstehen in einer Transaktion. Ohne sie koennte bei
 * einer doppelten SKU ein Produkt ohne Variante zurueckbleiben – genau der
 * Zustand, den die Regel ausschliesst.
 */
export default defineEventHandler(async (event) => {
  const eingabe = await leseRumpf(event, produktAnlegenSchema);
  const db = useDb();

  const varianten =
    eingabe.varianten && eingabe.varianten.length > 0
      ? eingabe.varianten
      : [
          {
            sku:
              eingabe.sku ??
              (() => {
                throw ungueltig(
                  'Es muss entweder eine Artikelnummer oder mindestens eine Variante angegeben werden.',
                  { sku: 'Artikelnummer fehlt.' },
                );
              })(),
            bezeichnung: 'Standard',
            mindestbestand: 0,
            basispreisNetto: null,
            ustSatz: 0.19,
          },
        ];

  try {
    return await db.transaction(async (tx) => {
      const [produkt] = await tx
        .insert(schema.produkte)
        .values({
          name: eingabe.name,
          beschreibung: eingabe.beschreibung ?? null,
          kategorie: eingabe.kategorie ?? null,
        })
        .returning();

      if (produkt === undefined) {
        throw new Error('Produkt konnte nicht angelegt werden.');
      }

      const angelegteVarianten = await tx
        .insert(schema.varianten)
        .values(
          varianten.map((v) => ({
            produktId: produkt.id,
            sku: v.sku,
            bezeichnung: v.bezeichnung,
            mindestbestand: v.mindestbestand ?? 0,
            basispreisNetto: centZuNumeric(v.basispreisNetto ?? null),
            ustSatz: satzZuNumeric(v.ustSatz ?? 0.19) ?? '0.1900',
          })),
        )
        .returning();

      setResponseStatus(event, 201);
      return {
        id: produkt.id,
        name: produkt.name,
        beschreibung: produkt.beschreibung,
        kategorie: produkt.kategorie,
        erstelltAm: produkt.erstelltAm,
        varianten: angelegteVarianten.map(bildeVarianteAb),
      };
    });
  } catch (fehler) {
    throw datenbankFehler(fehler, 'Artikel anlegen');
  }
});
