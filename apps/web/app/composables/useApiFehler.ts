import type { FetchError } from 'ofetch';

/** Nutzdaten, die jede API-Route im Fehlerfall mitschickt. */
interface Fehlernutzdaten {
  fehler?: string;
  felder?: Record<string, string>;
}

/**
 * Liest die einheitliche Fehlerform der API aus.
 *
 * Jede Route antwortet im Fehlerfall mit `{ data: { fehler, felder? } }`.
 * Diese Funktion holt daraus eine Meldung fuer den Nutzer und, falls
 * vorhanden, die Meldungen je Formularfeld.
 */
export function useApiFehler() {
  function leseFehler(fehler: unknown): {
    meldung: string;
    felder: Record<string, string>;
  } {
    const antwort = (fehler as FetchError | undefined)?.data as
      | (Fehlernutzdaten & { data?: Fehlernutzdaten })
      | undefined;

    // Nitro verschachtelt die Nutzdaten je nach Fehlerart unterschiedlich:
    // mal liegen sie direkt vor, mal noch einmal unter "data".
    const nutzdaten: Fehlernutzdaten | undefined = antwort?.data ?? antwort;

    return {
      meldung:
        nutzdaten?.fehler ??
        'Der Vorgang konnte nicht abgeschlossen werden. Bitte erneut versuchen.',
      felder: nutzdaten?.felder ?? {},
    };
  }

  return { leseFehler };
}
