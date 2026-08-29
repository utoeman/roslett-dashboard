/**
 * Zugriff auf die Artikel-API.
 *
 * Alle Aufrufe laufen ueber relative Pfade. Eine absolute URL oder
 * "localhost" darf im Client-Code nicht vorkommen, sonst funktioniert die
 * Anwendung auf dem Server nicht mehr.
 */

export interface Variante {
  id: string;
  sku: string;
  bezeichnung: string;
  mindestbestand: number;
  /** Ganzzahlige Cent oder null. */
  basispreisNetto: number | null;
  /** Dezimalsatz, 0.19 bedeutet 19 Prozent. */
  ustSatz: number | null;
  archiviertAm: string | null;
}

export interface Artikel {
  id: string;
  name: string;
  beschreibung: string | null;
  kategorie: string | null;
  archiviertAm: string | null;
  erstelltAm: string;
  varianten: Variante[];
}

export interface Kostenposition {
  id: string;
  varianteId: string | null;
  bezeichnung: string;
  art: 'fix' | 'prozent';
  /** Bei "fix" Cent, bei "prozent" ein Dezimalsatz. */
  wert: number | null;
  vorsteuerabzugsfaehig: boolean;
  aktiv: boolean;
  verteilmethode: 'wert' | 'stueckzahl';
}

export interface ArtikelDetail extends Artikel {
  kostenpositionen: Kostenposition[];
}

export function useArtikel() {
  function ladeListe(abfrage: {
    suche?: string;
    mitArchivierten?: boolean;
    kategorie?: string;
  }) {
    return useFetch<{
      eintraege: Artikel[];
      anzahl: number;
      limit: number;
      offset: number;
    }>('/api/artikel', {
      query: abfrage,
      // Der Schluessel haelt die Abfrage stabil, damit ein Tastendruck in
      // der Suche nicht jedes Mal eine neue Anfrage startet.
      key: 'artikel-liste',
    });
  }

  function ladeDetail(id: MaybeRefOrGetter<string>) {
    return useFetch<ArtikelDetail>(() => `/api/artikel/${toValue(id)}`, {
      key: () => `artikel-${toValue(id)}`,
    });
  }

  async function anlegen(eingabe: {
    name: string;
    kategorie?: string | null;
    beschreibung?: string | null;
    sku?: string;
    varianten?: Array<{
      sku: string;
      bezeichnung: string;
      basispreisNetto?: string | null;
      mindestbestand?: number;
    }>;
  }) {
    return $fetch<Artikel>('/api/artikel', {
      method: 'POST',
      body: eingabe,
    });
  }

  async function aendern(
    id: string,
    eingabe: Record<string, unknown>,
  ) {
    return $fetch<Artikel>(`/api/artikel/${id}`, {
      method: 'PATCH',
      body: eingabe,
    });
  }

  return { ladeListe, ladeDetail, anlegen, aendern };
}
