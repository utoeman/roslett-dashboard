/**
 * Fachliche Typen der Kalkulations-Engine.
 *
 * Dieses Paket kennt weder Vue noch eine Datenbank. Alle Typen hier sind
 * reine Datenstrukturen; Persistenzdetails wie UUIDs oder Zeitstempel
 * tauchen nur auf, soweit die Rechnung sie tatsaechlich braucht.
 */

import type { Cents, Rate } from './money.js';

// ---------------------------------------------------------------------------
// Kostenpositionen
// ---------------------------------------------------------------------------

/** Fixbetrag je Stueck oder Prozentsatz vom Bezugswert. */
export type CostItemKind = 'fix' | 'percent';

/**
 * Verteilmethode fuer Nebenkosten einer Sendung.
 *
 * `value`    – anteilig nach Warenwert. Standard, weil Fracht- und
 *              Zollkosten in der Praxis am Wert haengen.
 * `quantity` – anteilig nach Stueckzahl. Sinnvoll bei volumen- oder
 *              stueckgetriebenen Kosten, etwa Verpackung pro Teil.
 */
export type DistributionMethod = 'value' | 'quantity';

export interface CostItem {
  readonly id: string;
  /** `null` bedeutet: gilt global fuer alle Varianten. */
  readonly variantId: string | null;
  readonly label: string;
  readonly kind: CostItemKind;
  /**
   * Bei `kind: 'fix'` ein Cent-Betrag, bei `kind: 'percent'` eine Rate
   * (0.15 = 15 %). Die Doppelbelegung ist bewusst: sie haelt Datenmodell
   * und Formular einfach.
   */
  readonly value: Cents | Rate;
  /**
   * Vorsteuerabzugsfaehige Positionen bleiben aus den Selbstkosten heraus.
   * Klassischer Fall: Einfuhrumsatzsteuer. Zoll dagegen ist nicht
   * abzugsfaehig und gehoert damit in die Selbstkosten (Regel 3).
   */
  readonly inputTaxDeductible: boolean;
  readonly active: boolean;
  /** Nur fuer Nebenkosten einer Sendung relevant. Default `value`. */
  readonly distributionMethod: DistributionMethod;
}

// ---------------------------------------------------------------------------
// Chargen
// ---------------------------------------------------------------------------

/**
 * Eine Charge im Sinne der Engine: ein Wareneingang einer Variante zu einem
 * bestimmten Einstandspreis. Die Reihenfolge fuer FIFO ergibt sich aus
 * `receivedAt`, bei Gleichstand aus `id`.
 */
export interface Batch {
  readonly id: string;
  readonly variantId: string;
  readonly receivedAt: Date;
  readonly quantityReceived: number;
  readonly quantityRemaining: number;
  /** Einstandspreis je Stueck in EUR-Cent, inklusive verteilter Nebenkosten. */
  readonly landedCostEur: Cents;
}

/** Eingangsdaten einer Charge, bevor Nebenkosten verteilt sind. */
export interface BatchItem {
  readonly id: string;
  readonly variantId: string;
  readonly quantity: number;
  /** Reiner Warenwert der Position in EUR-Cent, ohne Nebenkosten. */
  readonly goodsValueEur: Cents;
}

/** Ein Fremdwaehrungsbetrag samt eingefrorenem Kurs (Regel 6). */
export interface ForeignAmount {
  readonly amount: Cents;
  /** ISO-4217-Code, etwa "USD". */
  readonly currency: string;
  /** Wert einer Einheit Fremdwaehrung in Euro. 1 USD = 0,92 EUR ergibt 0.92. */
  readonly exchangeRate: number;
}

// ---------------------------------------------------------------------------
// Nebenkostenverteilung
// ---------------------------------------------------------------------------

/** Eine auf eine Sendung entfallende Nebenkostenrechnung, etwa Fracht oder Zoll. */
export interface AdditionalCost {
  readonly label: string;
  readonly amountEur: Cents;
  readonly distributionMethod: DistributionMethod;
}

export interface DistributedAdditionalCosts {
  readonly batchId: string;
  /** Nebenkosten der gesamten Position in EUR-Cent. */
  readonly additionalCostsEur: Cents;
  /** Warenwert plus Nebenkosten der Position in EUR-Cent. */
  readonly totalLandedCostEur: Cents;
  /** Einstandspreis je Stueck in EUR-Cent, gerundet. */
  readonly landedCostEur: Cents;
  /**
   * Der Rundungsrest, der beim Teilen durch die Stueckzahl anfaellt.
   * Positiv bedeutet: die Summe der Stueckpreise liegt unter dem
   * Positionswert. Wird ausgewiesen statt verschluckt, damit die
   * Buchhaltung nachvollziehbar bleibt.
   */
  readonly roundingDifferenceEur: Cents;
}

export interface DistributionResult {
  readonly items: readonly DistributedAdditionalCosts[];
  readonly additionalCostsTotalEur: Cents;
  readonly goodsValueTotalEur: Cents;
}

// ---------------------------------------------------------------------------
// FIFO
// ---------------------------------------------------------------------------

/** Eine einzelne Chargenzuordnung eines Abgangs. */
export interface BatchAllocation {
  readonly batchId: string;
  readonly quantity: number;
  /** Einstandspreis je Stueck der betroffenen Charge in EUR-Cent. */
  readonly landedCostEur: Cents;
}

export interface FifoResult {
  readonly allocations: readonly BatchAllocation[];
  /** Chargen nach dem Abgang, mit aktualisierter Restmenge. */
  readonly batchesAfter: readonly Batch[];
  /** Wareneinsatz des Abgangs in EUR-Cent. */
  readonly costOfGoodsSoldEur: Cents;
  /** Menge, die mangels Restbestand nicht zugeordnet werden konnte. */
  readonly uncoveredQuantity: number;
}

// ---------------------------------------------------------------------------
// Kanaele und Preise
// ---------------------------------------------------------------------------

/**
 * `same_margin` – der Kanalpreis wird aus der Zielmarge zurueckgerechnet,
 *                 sodass nach Kanalgebuehren dieselbe Marge herauskommt.
 * `fixed`       – der Preis ist gesetzt; berechnet wird nur, was uebrig bleibt.
 */
export type PricingRule = 'same_margin' | 'fixed';

export interface Channel {
  readonly id: string;
  readonly name: string;
  /** Prozentuale Kanalgebuehr auf den Verkaufspreis, 0.065 = 6,5 %. */
  readonly feePercent: Rate;
  /** Fixe Gebuehr je Verkauf in EUR-Cent. */
  readonly feeFixed: Cents;
  readonly pricingRule: PricingRule;
  readonly active: boolean;
}

// ---------------------------------------------------------------------------
// Kalkulationsergebnisse
// ---------------------------------------------------------------------------

/** Eine einzelne Zeile im Kostenaufbau, fuer die Darstellung im Kalkulator. */
export interface CostRow {
  readonly label: string;
  readonly amountEur: Cents;
  /** Aus den Selbstkosten ausgenommen, weil Vorsteuer abziehbar (Regel 3). */
  readonly excluded: boolean;
}

export interface TotalCostResult {
  readonly landedCostEur: Cents;
  readonly rows: readonly CostRow[];
  /** Summe aller nicht ausgenommenen Positionen zuzueglich Einstandspreis. */
  readonly totalCostEur: Cents;
  /** Summe der ausgenommenen Positionen, nur zur Information. */
  readonly inputTaxEur: Cents;
}

export interface MarginResult {
  readonly salesPriceNetEur: Cents;
  readonly totalCostEur: Cents;
  readonly contributionMarginEur: Cents;
  /** Deckungsbeitrag / Verkaufspreis netto (Regel 4). */
  readonly margin: Rate;
  /** Deckungsbeitrag / Selbstkosten (Regel 4). */
  readonly markup: Rate;
}

export interface ChannelPriceResult {
  readonly channelId: string;
  readonly channelName: string;
  readonly salesPriceNetEur: Cents;
  readonly feesEur: Cents;
  readonly totalCostEur: Cents;
  readonly contributionMarginEur: Cents;
  readonly margin: Rate;
  readonly markup: Rate;
}
