/**
 * Antworttypen der API.
 *
 * Sie liegen in shared/, weil sie beschreiben, worauf sich Server und Client
 * geeinigt haben. Aendert eine Route ihre Antwort, faellt die Abweichung hier
 * auf – und nicht erst zur Laufzeit im Browser.
 *
 * Zur Erinnerung an die Systemgrenze: Geldbetraege sind in jeder Antwort
 * ganzzahlige Cent, Prozentsaetze Dezimalsaetze (0.19 bedeutet 19 Prozent).
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
  /** Bei "fix" ganzzahlige Cent, bei "prozent" ein Dezimalsatz. */
  wert: number | null;
  vorsteuerabzugsfaehig: boolean;
  aktiv: boolean;
  verteilmethode: 'wert' | 'stueckzahl';
}

export interface ArtikelDetail extends Artikel {
  kostenpositionen: Kostenposition[];
}

export interface Lieferant {
  id: string;
  name: string;
  land: string | null;
  notiz: string | null;
  archiviertAm: string | null;
}

export interface Kanal {
  id: string;
  name: string;
  /** Dezimalsatz, 0.065 bedeutet 6,5 Prozent. */
  gebuehrProzent: number | null;
  /** Ganzzahlige Cent. */
  gebuehrFix: number | null;
  preisregel: 'gleiche_marge' | 'fest';
  aktiv: boolean;
}

/** Gemeinsame Huelle aller Listenantworten. */
export interface Liste<T> {
  eintraege: T[];
  anzahl: number;
  limit?: number;
  offset?: number;
}
