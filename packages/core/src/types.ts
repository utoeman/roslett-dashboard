/**
 * Fachliche Typen der Kalkulations-Engine.
 *
 * Dieses Paket kennt weder Vue noch eine Datenbank. Alle Typen hier sind
 * reine Datenstrukturen; Persistenzdetails wie UUIDs oder Zeitstempel
 * tauchen nur auf, soweit die Rechnung sie tatsaechlich braucht.
 */

import type { Cent, Satz } from './money.js';

// ---------------------------------------------------------------------------
// Kostenpositionen
// ---------------------------------------------------------------------------

/** Fixbetrag je Stueck oder Prozentsatz vom Bezugswert. */
export type KostenpositionArt = 'fix' | 'prozent';

/**
 * Verteilmethode fuer Nebenkosten einer Sendung.
 *
 * `wert`       – anteilig nach Warenwert. Standard, weil Fracht- und
 *                Zollkosten in der Praxis am Wert haengen.
 * `stueckzahl` – anteilig nach Stueckzahl. Sinnvoll bei volumen- oder
 *                stueckgetriebenen Kosten, etwa Verpackung pro Teil.
 */
export type Verteilmethode = 'wert' | 'stueckzahl';

export interface Kostenposition {
  readonly id: string;
  /** `null` bedeutet: gilt global fuer alle Varianten. */
  readonly varianteId: string | null;
  readonly bezeichnung: string;
  readonly art: KostenpositionArt;
  /**
   * Bei `art: 'fix'` ein Cent-Betrag, bei `art: 'prozent'` ein Satz (0.15 = 15 %).
   * Die Doppelbelegung ist bewusst: sie haelt Datenmodell und Formular einfach.
   */
  readonly wert: Cent | Satz;
  /**
   * Vorsteuerabzugsfaehige Positionen bleiben aus den Selbstkosten heraus.
   * Klassischer Fall: Einfuhrumsatzsteuer. Zoll dagegen ist nicht abzugsfaehig
   * und gehoert damit in die Selbstkosten (Regel 3).
   */
  readonly vorsteuerabzugsfaehig: boolean;
  readonly aktiv: boolean;
  /** Nur fuer Nebenkosten einer Sendung relevant. Default `wert`. */
  readonly verteilmethode: Verteilmethode;
}

// ---------------------------------------------------------------------------
// Chargen
// ---------------------------------------------------------------------------

/**
 * Eine Charge im Sinne der Engine: ein Wareneingang einer Variante zu einem
 * bestimmten Einstandspreis. Die Reihenfolge fuer FIFO ergibt sich aus
 * `wareneingangAm`, bei Gleichstand aus `id`.
 */
export interface Charge {
  readonly id: string;
  readonly varianteId: string;
  readonly wareneingangAm: Date;
  readonly mengeEingang: number;
  readonly mengeRest: number;
  /** Einstandspreis je Stueck in EUR-Cent, inklusive verteilter Nebenkosten. */
  readonly einstandspreisEur: Cent;
}

/** Eingangsdaten einer Charge, bevor Nebenkosten verteilt sind. */
export interface ChargePosition {
  readonly id: string;
  readonly varianteId: string;
  readonly menge: number;
  /** Reiner Warenwert der Position in EUR-Cent, ohne Nebenkosten. */
  readonly warenwertEur: Cent;
}

/** Ein Fremdwaehrungsbetrag samt eingefrorenem Kurs (Regel 6). */
export interface Fremdbetrag {
  readonly betrag: Cent;
  /** ISO-4217-Code, etwa "USD". */
  readonly waehrung: string;
  /** Wert einer Einheit Fremdwaehrung in Euro. 1 USD = 0,92 EUR ergibt 0.92. */
  readonly wechselkurs: number;
}

// ---------------------------------------------------------------------------
// Nebenkostenverteilung
// ---------------------------------------------------------------------------

/** Eine auf eine Sendung entfallende Nebenkostenrechnung, etwa Fracht oder Zoll. */
export interface Nebenkosten {
  readonly bezeichnung: string;
  readonly betragEur: Cent;
  readonly verteilmethode: Verteilmethode;
}

export interface VerteilteNebenkosten {
  readonly chargeId: string;
  /** Nebenkosten der gesamten Position in EUR-Cent. */
  readonly nebenkostenEur: Cent;
  /** Warenwert plus Nebenkosten der Position in EUR-Cent. */
  readonly einstandGesamtEur: Cent;
  /** Einstandspreis je Stueck in EUR-Cent, gerundet. */
  readonly einstandspreisEur: Cent;
  /**
   * Der Rundungsrest, der beim Teilen durch die Stueckzahl anfaellt.
   * Positiv bedeutet: die Summe der Stueckpreise liegt unter dem Positionswert.
   * Wird ausgewiesen statt verschluckt, damit die Buchhaltung nachvollziehbar bleibt.
   */
  readonly rundungsdifferenzEur: Cent;
}

export interface VerteilungsErgebnis {
  readonly positionen: readonly VerteilteNebenkosten[];
  readonly nebenkostenGesamtEur: Cent;
  readonly warenwertGesamtEur: Cent;
}

// ---------------------------------------------------------------------------
// FIFO
// ---------------------------------------------------------------------------

/** Eine einzelne Chargenzuordnung eines Abgangs. */
export interface Chargenzuordnung {
  readonly chargeId: string;
  readonly menge: number;
  /** Einstandspreis je Stueck der betroffenen Charge in EUR-Cent. */
  readonly einstandspreisEur: Cent;
}

export interface FifoErgebnis {
  readonly zuordnungen: readonly Chargenzuordnung[];
  /** Chargen nach dem Abgang, mit aktualisierter Restmenge. */
  readonly chargenNachher: readonly Charge[];
  /** Wareneinsatz des Abgangs in EUR-Cent. */
  readonly wareneinsatzEur: Cent;
  /** Menge, die mangels Restbestand nicht zugeordnet werden konnte. */
  readonly ungedeckteMenge: number;
}

// ---------------------------------------------------------------------------
// Kanaele und Preise
// ---------------------------------------------------------------------------

/**
 * `gleiche_marge` – der Kanalpreis wird aus der Zielmarge zurueckgerechnet,
 *                   sodass nach Kanalgebuehren dieselbe Marge herauskommt.
 * `fest`          – der Preis ist gesetzt; berechnet wird nur, was uebrig bleibt.
 */
export type Preisregel = 'gleiche_marge' | 'fest';

export interface Kanal {
  readonly id: string;
  readonly name: string;
  /** Prozentuale Kanalgebuehr auf den Verkaufspreis, 0.065 = 6,5 %. */
  readonly gebuehrProzent: Satz;
  /** Fixe Gebuehr je Verkauf in EUR-Cent. */
  readonly gebuehrFix: Cent;
  readonly preisregel: Preisregel;
  readonly aktiv: boolean;
}

// ---------------------------------------------------------------------------
// Kalkulationsergebnisse
// ---------------------------------------------------------------------------

/** Eine einzelne Zeile im Kostenaufbau, fuer die Darstellung im Kalkulator. */
export interface Kostenzeile {
  readonly bezeichnung: string;
  readonly betragEur: Cent;
  /** Aus den Selbstkosten ausgenommen, weil Vorsteuer abziehbar (Regel 3). */
  readonly ausgenommen: boolean;
}

export interface SelbstkostenErgebnis {
  readonly einstandspreisEur: Cent;
  readonly zeilen: readonly Kostenzeile[];
  /** Summe aller nicht ausgenommenen Positionen zuzueglich Einstandspreis. */
  readonly selbstkostenEur: Cent;
  /** Summe der ausgenommenen Positionen, nur zur Information. */
  readonly vorsteuerEur: Cent;
}

export interface MargenErgebnis {
  readonly verkaufspreisNettoEur: Cent;
  readonly selbstkostenEur: Cent;
  readonly deckungsbeitragEur: Cent;
  /** Deckungsbeitrag / Verkaufspreis netto (Regel 4). */
  readonly marge: Satz;
  /** Deckungsbeitrag / Selbstkosten (Regel 4). */
  readonly aufschlag: Satz;
}

export interface KanalpreisErgebnis {
  readonly kanalId: string;
  readonly kanalName: string;
  readonly verkaufspreisNettoEur: Cent;
  readonly gebuehrenEur: Cent;
  readonly selbstkostenEur: Cent;
  readonly deckungsbeitragEur: Cent;
  readonly marge: Satz;
  readonly aufschlag: Satz;
}
