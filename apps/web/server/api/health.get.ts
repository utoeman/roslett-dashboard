import { sql } from 'drizzle-orm';
import { useDb } from '../db/client.js';

/**
 * Zustandspruefung.
 *
 * Prueft ausdruecklich die Datenbankverbindung und nicht nur, ob der Prozess
 * laeuft. Ein Nitro-Server, der antwortet, aber die Datenbank nicht erreicht,
 * ist fuer dieses Werkzeug nutzlos – die Pruefung soll das melden.
 *
 * Die Route bleibt spaeter von der Authentifizierung ausgenommen, damit ein
 * Reverse Proxy oder eine Ueberwachung sie ohne Anmeldung abfragen kann.
 */
export default defineEventHandler(async (event) => {
  const start = Date.now();
  try {
    await useDb().execute(sql`select 1`);
    return {
      status: 'ok' as const,
      datenbank: 'erreichbar' as const,
      dauerMs: Date.now() - start,
      zeit: new Date().toISOString(),
    };
  } catch (fehler) {
    setResponseStatus(event, 503);
    return {
      status: 'fehler' as const,
      datenbank: 'nicht erreichbar' as const,
      dauerMs: Date.now() - start,
      zeit: new Date().toISOString(),
      meldung: fehler instanceof Error ? fehler.message : String(fehler),
    };
  }
});
