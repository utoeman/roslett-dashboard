import type { FetchError } from 'ofetch';

/**
 * Nutzdaten, die jede API-Route im Fehlerfall mitschickt.
 * Die Schluessel sind deutsch, weil sie unveraendert angezeigt werden.
 */
interface ErrorPayload {
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
export function useApiError() {
  function readError(error: unknown): {
    message: string;
    fields: Record<string, string>;
  } {
    const response = (error as FetchError | undefined)?.data as
      | (ErrorPayload & { data?: ErrorPayload })
      | undefined;

    // Nitro verschachtelt die Nutzdaten je nach Fehlerart unterschiedlich:
    // mal liegen sie direkt vor, mal noch einmal unter "data".
    const payload: ErrorPayload | undefined = response?.data ?? response;

    return {
      message:
        payload?.fehler ??
        'Der Vorgang konnte nicht abgeschlossen werden. Bitte erneut versuchen.',
      fields: payload?.felder ?? {},
    };
  }

  return { readError };
}
