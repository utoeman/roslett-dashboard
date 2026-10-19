import type { FetchError } from 'ofetch';

/** Error payload of every API route (German keys, shown as-is). */
interface ErrorPayload {
  fehler?: string;
  felder?: Record<string, string>;
}

/** Reads `{ data: { fehler, felder? } }` into a message and per-field errors. */
export function useApiError() {
  function readError(error: unknown): {
    message: string;
    fields: Record<string, string>;
  } {
    const response = (error as FetchError | undefined)?.data as
      | (ErrorPayload & { data?: ErrorPayload })
      | undefined;

    // Nitro sometimes nests the payload one level deeper under "data".
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
