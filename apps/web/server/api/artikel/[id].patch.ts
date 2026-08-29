import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema, useDb } from '../../db/client.js';
import {
  produktAendernSchema,
  varianteAendernSchema,
  varianteAnlegenSchema,
} from '../../../shared/schemas/artikel.js';
import { leseId, leseRumpf, musstExistieren } from '../../utils/validierung.js';
import { datenbankFehler, ungueltig } from '../../utils/errors.js';
import { centZuNumeric, satzZuNumeric } from '../../utils/geld.js';
import { bildeVarianteAb } from '../../utils/abbildung.js';

/**
 * Der Rumpf kann Produktfelder aendern und gleichzeitig Varianten anlegen
 * oder aendern. Beides in einem Aufruf, damit das Detailformular mit einem
 * Speichern auskommt und nicht in einen halb gespeicherten Zustand geraet.
 */
const rumpfSchema = produktAendernSchema.extend({
  neueVarianten: z.array(varianteAnlegenSchema).optional(),
  geaenderteVarianten: z.array(varianteAendernSchema).optional(),
});

/**
 * Artikel aendern.
 *
 * Geloescht wird nichts. Eine Variante verschwindet, indem `archiviertAm`
 * gesetzt wird; `null` holt sie zurueck.
 *
 * Alles laeuft in einer Transaktion: schlaegt eine einzelne Variante fehl,
 * etwa wegen doppelter SKU, bleibt der gesamte Vorgang aus. Sonst waere nach
 * einem Fehlschlag unklar, was gespeichert wurde und was nicht.
 */
export default defineEventHandler(async (event) => {
  const id = leseId(event);
  const eingabe = await leseRumpf(event, rumpfSchema);
  const db = useDb();

  musstExistieren(
    await db.query.produkte.findFirst({
      where: eq(schema.produkte.id, id),
      columns: { id: true },
    }),
    'Der Artikel',
  );

  const { neueVarianten, geaenderteVarianten, ...produktfelder } = eingabe;

  // Nur uebergebene Felder anfassen: ein fehlendes Feld bedeutet
  // "unveraendert", nicht "auf null setzen".
  const produktAenderung: Record<string, unknown> = {};
  if (produktfelder.name !== undefined) produktAenderung.name = produktfelder.name;
  if (produktfelder.beschreibung !== undefined)
    produktAenderung.beschreibung = produktfelder.beschreibung;
  if (produktfelder.kategorie !== undefined)
    produktAenderung.kategorie = produktfelder.kategorie;
  if (produktfelder.archiviertAm !== undefined)
    produktAenderung.archiviertAm = produktfelder.archiviertAm;

  try {
    return await db.transaction(async (tx) => {
      if (Object.keys(produktAenderung).length > 0) {
        await tx
          .update(schema.produkte)
          .set(produktAenderung)
          .where(eq(schema.produkte.id, id));
      }

      if (neueVarianten && neueVarianten.length > 0) {
        await tx.insert(schema.varianten).values(
          neueVarianten.map((v) => ({
            produktId: id,
            sku: v.sku,
            bezeichnung: v.bezeichnung,
            mindestbestand: v.mindestbestand ?? 0,
            basispreisNetto: centZuNumeric(v.basispreisNetto ?? null),
            ustSatz: satzZuNumeric(v.ustSatz ?? 0.19) ?? '0.1900',
          })),
        );
      }

      for (const v of geaenderteVarianten ?? []) {
        const bestehend = await tx.query.varianten.findFirst({
          where: eq(schema.varianten.id, v.id),
          columns: { id: true, produktId: true },
        });
        if (bestehend === undefined) {
          throw ungueltig(`Variante ${v.id} wurde nicht gefunden.`);
        }
        // Verhindert, dass ueber diesen Weg eine fremde Variante veraendert wird.
        if (bestehend.produktId !== id) {
          throw ungueltig('Die Variante gehoert nicht zu diesem Artikel.');
        }

        const aenderung: Record<string, unknown> = {};
        if (v.sku !== undefined) aenderung.sku = v.sku;
        if (v.bezeichnung !== undefined) aenderung.bezeichnung = v.bezeichnung;
        if (v.mindestbestand !== undefined)
          aenderung.mindestbestand = v.mindestbestand;
        if (v.basispreisNetto !== undefined)
          aenderung.basispreisNetto = centZuNumeric(v.basispreisNetto);
        if (v.ustSatz !== undefined) aenderung.ustSatz = satzZuNumeric(v.ustSatz);
        if (v.archiviertAm !== undefined) aenderung.archiviertAm = v.archiviertAm;

        if (Object.keys(aenderung).length > 0) {
          await tx
            .update(schema.varianten)
            .set(aenderung)
            .where(eq(schema.varianten.id, v.id));
        }
      }

      const aktualisiert = await tx.query.produkte.findFirst({
        where: eq(schema.produkte.id, id),
        with: { varianten: true },
      });
      if (aktualisiert === undefined) {
        throw new Error('Artikel nach dem Speichern nicht auffindbar.');
      }
      // Ueber dieselbe Abbildung wie die GET-Routen, damit die Oberflaeche
      // nicht je Endpunkt unterschiedlich rechnen muss.
      return {
        id: aktualisiert.id,
        name: aktualisiert.name,
        beschreibung: aktualisiert.beschreibung,
        kategorie: aktualisiert.kategorie,
        archiviertAm: aktualisiert.archiviertAm,
        erstelltAm: aktualisiert.erstelltAm,
        varianten: aktualisiert.varianten.map(bildeVarianteAb),
      };
    });
  } catch (fehler) {
    throw datenbankFehler(fehler, 'Artikel aendern');
  }
});
