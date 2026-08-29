/**
 * Nebenkostenverteilung (landed cost).
 *
 * Eine Sendung enthaelt mehrere Chargenpositionen – im Regelfall
 * unterschiedliche Varianten, die gemeinsam angeliefert wurden. Auf dieser
 * Sendung liegen Nebenkosten wie Fracht und Zoll, die nicht einer einzelnen
 * Position zuzuordnen sind. Diese Kosten werden anteilig verteilt und danach
 * je Position als fester Betrag persistiert (Regel 7). Zur Anzeigezeit wird
 * nie neu gerechnet.
 *
 * Wichtig zur Abgrenzung: Einfuhrumsatzsteuer gehoert hier nicht hinein,
 * weil sie als Vorsteuer abziehbar ist. Zoll dagegen schon (Regel 3). Die
 * Auswahl trifft der Aufrufer, indem er nur nicht abzugsfaehige Positionen
 * uebergibt.
 */

import type { Cents } from './money.js';
import {
  MoneyError,
  assertCents,
  distributeByWeight,
  round,
  sum,
} from './money.js';
import type {
  AdditionalCost,
  BatchItem,
  DistributedAdditionalCosts,
  DistributionResult,
} from './types.js';

export class DistributionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DistributionError';
  }
}

/**
 * Verteilt die Nebenkosten einer Sendung auf ihre Chargenpositionen.
 *
 * Jede Nebenkostenrechnung wird einzeln nach ihrer eigenen Methode verteilt
 * und die Teilergebnisse werden anschliessend addiert. Das ist genauer als
 * eine Verteilung der Gesamtsumme, weil Fracht nach Wert und Verpackung nach
 * Stueckzahl aufgeteilt werden koennen, ohne sich gegenseitig zu
 * verfaelschen.
 *
 * Die Verteilung selbst ist restfrei: `distributeByWeight` vergibt den
 * Rundungsrest deterministisch, sodass die Summe der Positionsanteile exakt
 * dem Rechnungsbetrag entspricht. Kein Cent geht verloren, keiner entsteht.
 *
 * Der Stueckpreis wird erst ganz am Ende gerundet (Regel 10). Die dabei
 * unvermeidbare Differenz zwischen Positionsbetrag und Stueckpreis mal
 * Stueckzahl wird als `roundingDifferenceEur` ausgewiesen, statt sie
 * stillschweigend verschwinden zu lassen.
 */
export function distributeAdditionalCosts(
  items: readonly BatchItem[],
  additionalCosts: readonly AdditionalCost[],
): DistributionResult {
  if (items.length === 0) {
    throw new DistributionError(
      'Eine Sendung ohne Positionen kann keine Nebenkosten aufnehmen.',
    );
  }

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new DistributionError(
        `Position ${item.id}: Menge muss eine positive Ganzzahl sein, erhalten: ${String(item.quantity)}`,
      );
    }
    try {
      assertCents(item.goodsValueEur, `Warenwert der Position ${item.id}`);
    } catch (error) {
      /* c8 ignore next */
      throw new DistributionError((error as MoneyError).message);
    }
    if (item.goodsValueEur < 0) {
      throw new DistributionError(
        `Position ${item.id}: Warenwert darf nicht negativ sein.`,
      );
    }
  }

  const valueWeights = items.map((item) => item.goodsValueEur);
  const quantityWeights = items.map((item) => item.quantity);

  // Anteile je Position aufsummieren, eine Nebenkostenrechnung nach der anderen.
  const shares = items.map(() => 0);
  for (const cost of additionalCosts) {
    assertCents(cost.amountEur, `Nebenkosten "${cost.label}"`);
    if (cost.amountEur === 0) continue;
    const weights =
      cost.distributionMethod === 'quantity' ? quantityWeights : valueWeights;
    const distributed = distributeByWeight(cost.amountEur, weights);
    for (let i = 0; i < shares.length; i += 1) {
      shares[i] = (shares[i] ?? 0) + (distributed[i] ?? 0);
    }
  }

  const resultItems: DistributedAdditionalCosts[] = items.map((item, i) => {
    const additionalCostsEur = shares[i] ?? 0;
    const totalLandedCostEur = item.goodsValueEur + additionalCostsEur;
    const landedCostEur = round(totalLandedCostEur / item.quantity);
    const roundingDifferenceEur =
      totalLandedCostEur - landedCostEur * item.quantity;
    return {
      batchId: item.id,
      additionalCostsEur,
      totalLandedCostEur,
      landedCostEur,
      roundingDifferenceEur,
    };
  });

  return {
    items: resultItems,
    additionalCostsTotalEur: sum(additionalCosts.map((c) => c.amountEur)),
    goodsValueTotalEur: sum(valueWeights),
  };
}

/**
 * Einstandspreis je Stueck fuer eine einzelne Position ohne Sendungskontext.
 *
 * Bequemlichkeitsfunktion fuer den haeufigen Fall, dass ein Wareneingang nur
 * eine Position enthaelt. Sie ruft dieselbe Verteilung auf, damit es keinen
 * zweiten Rechenweg gibt, der auseinanderlaufen koennte.
 */
export function landedCostPerUnit(
  item: BatchItem,
  additionalCosts: readonly AdditionalCost[] = [],
): Cents {
  const result = distributeAdditionalCosts([item], additionalCosts);
  /* c8 ignore next */
  return result.items[0]?.landedCostEur ?? 0;
}
