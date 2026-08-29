/**
 * Preis- und Margenrechnung.
 *
 * Alles hier laeuft netto (Regel 2). Umsatzsteuer ist bei einem
 * regelbesteuerten Unternehmen ein durchlaufender Posten und beruehrt die
 * Marge nicht. Sie taucht in diesem Modul deshalb gar nicht auf.
 */

import type { Cents, Rate } from './money.js';
import { assertCents, formatPercent, round, share } from './money.js';
import type {
  Channel,
  ChannelPriceResult,
  CostItem,
  CostRow,
  MarginResult,
  TotalCostResult,
} from './types.js';

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingError';
  }
}

/**
 * Waehlt die Kostenpositionen aus, die fuer eine Variante gelten:
 * alle aktiven globalen plus alle aktiven der Variante selbst.
 */
export function costItemsForVariant(
  items: readonly CostItem[],
  variantId: string,
): CostItem[] {
  return items.filter(
    (item) =>
      item.active && (item.variantId === null || item.variantId === variantId),
  );
}

/**
 * Berechnet die Selbstkosten je Stueck aus Einstandspreis und
 * Kostenpositionen.
 *
 * Prozentuale Positionen beziehen sich hier auf den Einstandspreis, nicht auf
 * den Verkaufspreis. Kosten, die am Verkaufspreis haengen – Kanalgebuehren
 * etwa – sind keine Selbstkosten, sondern gehen in die Rueckwaertsrechnung
 * ein, weil sie den gesuchten Preis voraussetzen.
 *
 * Vorsteuerabzugsfaehige Positionen werden zwar ausgewiesen, aber nicht
 * eingerechnet (Regel 3). Die Einfuhrumsatzsteuer ist der Standardfall: sie
 * wird gezahlt, aber zurueckgeholt und belastet die Marge nicht. Zoll
 * hingegen ist nicht abzugsfaehig und zaehlt voll mit.
 *
 * Gerundet wird erst am Schluss (Regel 10): die prozentualen Anteile bleiben
 * bis zur Summenbildung Fliesskomma.
 */
export function calculateTotalCost(
  landedCostEur: Cents,
  items: readonly CostItem[],
): TotalCostResult {
  assertCents(landedCostEur, 'Einstandspreis');

  const rows: CostRow[] = [];
  let chargeable = 0;
  let inputTax = 0;

  for (const item of items) {
    if (!item.active) continue;
    const raw =
      item.kind === 'percent'
        ? share(landedCostEur, item.value)
        : assertCents(item.value, `Kostenposition "${item.label}"`);

    if (item.inputTaxDeductible) {
      inputTax += raw;
    } else {
      chargeable += raw;
    }

    rows.push({
      label: item.label,
      amountEur: round(raw),
      excluded: item.inputTaxDeductible,
    });
  }

  return {
    landedCostEur,
    rows,
    totalCostEur: round(landedCostEur + chargeable),
    inputTaxEur: round(inputTax),
  };
}

/**
 * Marge und Aufschlag zu einem gegebenen Verkaufspreis.
 *
 * Die beiden Kennzahlen werden regelmaessig verwechselt, deshalb hier
 * ausdruecklich (Regel 4):
 *
 *   Marge     = Deckungsbeitrag / Verkaufspreis netto
 *   Aufschlag = Deckungsbeitrag / Selbstkosten
 *
 * Bei 40 EUR Selbstkosten und 100 EUR Verkaufspreis betraegt die Marge 60 %,
 * der Aufschlag aber 150 %. Sie werden nie ineinander umgerechnet, sondern
 * immer getrennt ausgewiesen.
 *
 * Sonderfaelle: Bei einem Verkaufspreis von 0 ist die Marge nicht definiert
 * und wird als 0 zurueckgegeben; bei Selbstkosten von 0 gilt dasselbe fuer
 * den Aufschlag. Ein Fehler waere hier unangebracht, weil der Kalkulator
 * waehrend der Eingabe zwangslaeufig durch solche Zwischenzustaende laeuft.
 */
export function calculateMargin(
  salesPriceNetEur: Cents,
  totalCostEur: Cents,
): MarginResult {
  assertCents(salesPriceNetEur, 'Verkaufspreis');
  assertCents(totalCostEur, 'Selbstkosten');

  const contributionMargin = salesPriceNetEur - totalCostEur;

  return {
    salesPriceNetEur,
    totalCostEur,
    contributionMarginEur: contributionMargin,
    margin: salesPriceNetEur === 0 ? 0 : contributionMargin / salesPriceNetEur,
    markup: totalCostEur === 0 ? 0 : contributionMargin / totalCostEur,
  };
}

/**
 * Rueckwaertsrechnung: gesuchter Verkaufspreis zu einer Zielmarge (Regel 5).
 *
 * Der Denkfehler, den diese Funktion vermeidet: prozentuale Gebuehren
 * beziehen sich auf den Verkaufspreis, den wir erst suchen. Wer die Gebuehr
 * auf die Selbstkosten aufschlaegt, rechnet zu niedrig.
 *
 *   VK = (Selbstkosten + Fixgebuehren) / (1 - Zielmarge - Gebuehrensatz)
 *
 * Der Nenner beschreibt den Anteil des Verkaufspreises, der nach Marge und
 * prozentualen Gebuehren fuer die Kosten uebrig bleibt. Ist er null oder
 * negativ, existiert kein Preis, der die Vorgabe erfuellt: die Zielmarge
 * frisst zusammen mit den Gebuehren bereits den gesamten Erloes. Ein hoeherer
 * Preis hilft dann nicht, weil Marge und Gebuehr proportional mitwachsen.
 */
export function calculateSalesPrice(parameters: {
  totalCostEur: Cents;
  targetMargin: Rate;
  feePercent?: Rate;
  feeFixedEur?: Cents;
}): Cents {
  const {
    totalCostEur,
    targetMargin,
    feePercent = 0,
    feeFixedEur = 0,
  } = parameters;

  assertCents(totalCostEur, 'Selbstkosten');
  assertCents(feeFixedEur, 'Fixgebuehr');

  if (!Number.isFinite(targetMargin)) {
    throw new PricingError(
      `Zielmarge ist keine gueltige Zahl: ${String(targetMargin)}`,
    );
  }
  if (!Number.isFinite(feePercent) || feePercent < 0) {
    throw new PricingError(
      `Gebuehrensatz muss endlich und nicht negativ sein, erhalten: ${String(feePercent)}`,
    );
  }
  if (targetMargin >= 1) {
    throw new PricingError(
      `Eine Zielmarge von ${formatPercent(targetMargin)} ist nicht erreichbar: ` +
        'die Marge muss unter 100 % liegen, weil der Deckungsbeitrag Teil des Verkaufspreises ist.',
    );
  }

  const denominator = 1 - targetMargin - feePercent;
  if (denominator <= 0) {
    // Fehlermeldungen werden dem Nutzer im Kalkulator angezeigt und muessen
    // deshalb deutsch formatiert sein, also mit Komma als Dezimaltrenner.
    throw new PricingError(
      `Zielmarge ${formatPercent(targetMargin)} und Gebuehren ` +
        `${formatPercent(feePercent)} ergeben zusammen ` +
        `${formatPercent(targetMargin + feePercent)} und lassen damit nichts ` +
        'fuer die Selbstkosten uebrig. Es gibt keinen Verkaufspreis, der diese Vorgabe erfuellt. ' +
        'Zielmarge senken oder einen guenstigeren Kanal waehlen.',
    );
  }

  return round((totalCostEur + feeFixedEur) / denominator);
}

/**
 * Kanalpreis fuer eine Variante.
 *
 * Bei `pricingRule: 'same_margin'` wird der Preis so zurueckgerechnet, dass
 * nach Abzug der Kanalgebuehren die Zielmarge stehen bleibt. Bei
 * `pricingRule: 'fixed'` gilt der uebergebene Preis, und berechnet wird nur,
 * was davon uebrig bleibt – dann kann die tatsaechliche Marge unter der
 * Zielmarge liegen, was der Kalkulator so auch anzeigen soll.
 */
export function calculateChannelPrice(parameters: {
  channel: Channel;
  totalCostEur: Cents;
  targetMargin: Rate;
  fixedPriceEur?: Cents;
}): ChannelPriceResult {
  const { channel, totalCostEur, targetMargin, fixedPriceEur } = parameters;
  assertCents(totalCostEur, 'Selbstkosten');

  let salesPrice: Cents;
  if (channel.pricingRule === 'fixed') {
    if (fixedPriceEur === undefined) {
      throw new PricingError(
        `Kanal "${channel.name}" hat die Preisregel "fest", es wurde aber kein Festpreis uebergeben.`,
      );
    }
    salesPrice = assertCents(fixedPriceEur, 'Festpreis');
  } else {
    salesPrice = calculateSalesPrice({
      totalCostEur,
      targetMargin,
      feePercent: channel.feePercent,
      feeFixedEur: channel.feeFixed,
    });
  }

  // Erst hier runden: der prozentuale Gebuehrenanteil bleibt bis zur
  // Summenbildung mit der Fixgebuehr ungerundet (Regel 10).
  const fees = round(share(salesPrice, channel.feePercent) + channel.feeFixed);
  const contributionMargin = salesPrice - totalCostEur - fees;

  return {
    channelId: channel.id,
    channelName: channel.name,
    salesPriceNetEur: salesPrice,
    feesEur: fees,
    totalCostEur,
    contributionMarginEur: contributionMargin,
    margin: salesPrice === 0 ? 0 : contributionMargin / salesPrice,
    markup: totalCostEur === 0 ? 0 : contributionMargin / totalCostEur,
  };
}

/**
 * Zielmarge, die noetig ist, um bei gegebenem Verkaufspreis und Kanal
 * kostendeckend zu bleiben. Nuetzlich fuer die Warnschwelle im Regler.
 */
export function minimumMargin(
  totalCostEur: Cents,
  channel: Pick<Channel, 'feePercent' | 'feeFixed'>,
  salesPriceNetEur: Cents,
): Rate {
  assertCents(totalCostEur, 'Selbstkosten');
  assertCents(salesPriceNetEur, 'Verkaufspreis');
  if (salesPriceNetEur === 0) return 0;
  const fees = share(salesPriceNetEur, channel.feePercent) + channel.feeFixed;
  return (salesPriceNetEur - totalCostEur - fees) / salesPriceNetEur;
}
