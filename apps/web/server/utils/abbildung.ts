/**
 * Abbildung von Datenbankzeilen auf Antwortobjekte.
 *
 * Jede Route liefert dieselbe Form, damit die Oberflaeche nicht je Endpunkt
 * unterscheiden muss. Insbesondere sind Geldbetraege in jeder Antwort
 * ganzzahlige Cent und Prozentsaetze immer Dezimalsaetze – nie der rohe
 * NUMERIC-String aus Postgres.
 */

import { numericZuCent, numericZuSatz } from './geld.js';

type VariantenZeile = {
  id: string;
  produktId?: string;
  sku: string;
  bezeichnung: string;
  mindestbestand: number;
  basispreisNetto: string | null;
  ustSatz: string;
  archiviertAm: Date | null;
  erstelltAm?: Date;
};

export function bildeVarianteAb(v: VariantenZeile) {
  return {
    id: v.id,
    sku: v.sku,
    bezeichnung: v.bezeichnung,
    mindestbestand: v.mindestbestand,
    basispreisNetto: numericZuCent(v.basispreisNetto),
    ustSatz: numericZuSatz(v.ustSatz),
    archiviertAm: v.archiviertAm,
  };
}

type KostenpositionZeile = {
  id: string;
  varianteId: string | null;
  bezeichnung: string;
  art: 'fix' | 'prozent';
  wert: string;
  vorsteuerabzugsfaehig: boolean;
  aktiv: boolean;
  verteilmethode: 'wert' | 'stueckzahl';
};

/**
 * Der Wert bedeutet je nach Art etwas anderes: bei "fix" ein Cent-Betrag,
 * bei "prozent" ein Dezimalsatz. Diese Unterscheidung an genau einer Stelle
 * zu treffen verhindert, dass irgendwo ein Satz als Betrag gelesen wird.
 */
export function bildeKostenpositionAb(k: KostenpositionZeile) {
  return {
    id: k.id,
    varianteId: k.varianteId,
    bezeichnung: k.bezeichnung,
    art: k.art,
    wert: k.art === 'fix' ? numericZuCent(k.wert) : numericZuSatz(k.wert),
    vorsteuerabzugsfaehig: k.vorsteuerabzugsfaehig,
    aktiv: k.aktiv,
    verteilmethode: k.verteilmethode,
  };
}

type KanalZeile = {
  id: string;
  name: string;
  gebuehrProzent: string;
  gebuehrFix: string;
  preisregel: 'gleiche_marge' | 'fest';
  aktiv: boolean;
};

export function bildeKanalAb(k: KanalZeile) {
  return {
    id: k.id,
    name: k.name,
    gebuehrProzent: numericZuSatz(k.gebuehrProzent),
    gebuehrFix: numericZuCent(k.gebuehrFix),
    preisregel: k.preisregel,
    aktiv: k.aktiv,
  };
}
