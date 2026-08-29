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
 * Wichtig zur Abgrenzung: Einfuhrumsatzsteuer gehoert hier nicht hinein, weil
 * sie als Vorsteuer abziehbar ist. Zoll dagegen schon (Regel 3). Die Auswahl
 * trifft der Aufrufer, indem er nur nicht abzugsfaehige Positionen uebergibt.
 */

import type { Cent } from './money.js';
import {
  GeldFehler,
  pruefeCent,
  runde,
  summe,
  verteileNachGewicht,
} from './money.js';
import type {
  ChargePosition,
  Nebenkosten,
  VerteilteNebenkosten,
  VerteilungsErgebnis,
} from './types.js';

export class VerteilungsFehler extends Error {
  constructor(nachricht: string) {
    super(nachricht);
    this.name = 'VerteilungsFehler';
  }
}

/**
 * Verteilt die Nebenkosten einer Sendung auf ihre Chargenpositionen.
 *
 * Jede Nebenkostenrechnung wird einzeln nach ihrer eigenen Methode verteilt
 * und die Teilergebnisse werden anschliessend addiert. Das ist genauer als
 * eine Verteilung der Gesamtsumme, weil Fracht nach Wert und Verpackung nach
 * Stueckzahl aufgeteilt werden koennen, ohne sich gegenseitig zu verfaelschen.
 *
 * Die Verteilung selbst ist restfrei: `verteileNachGewicht` vergibt den
 * Rundungsrest deterministisch, sodass die Summe der Positionsanteile exakt
 * dem Rechnungsbetrag entspricht. Kein Cent geht verloren, keiner entsteht.
 *
 * Der Stueckpreis wird erst ganz am Ende gerundet (Regel 10). Die dabei
 * unvermeidbare Differenz zwischen Positionsbetrag und
 * Stueckpreis mal Stueckzahl wird als `rundungsdifferenzEur` ausgewiesen,
 * statt sie stillschweigend verschwinden zu lassen.
 */
export function verteileNebenkosten(
  positionen: readonly ChargePosition[],
  nebenkosten: readonly Nebenkosten[],
): VerteilungsErgebnis {
  if (positionen.length === 0) {
    throw new VerteilungsFehler(
      'Eine Sendung ohne Positionen kann keine Nebenkosten aufnehmen.',
    );
  }

  for (const p of positionen) {
    if (!Number.isInteger(p.menge) || p.menge <= 0) {
      throw new VerteilungsFehler(
        `Position ${p.id}: Menge muss eine positive Ganzzahl sein, erhalten: ${String(p.menge)}`,
      );
    }
    try {
      pruefeCent(p.warenwertEur, `Warenwert der Position ${p.id}`);
    } catch (fehler) {
      /* c8 ignore next */
      throw new VerteilungsFehler((fehler as GeldFehler).message);
    }
    if (p.warenwertEur < 0) {
      throw new VerteilungsFehler(
        `Position ${p.id}: Warenwert darf nicht negativ sein.`,
      );
    }
  }

  const gewichteWert = positionen.map((p) => p.warenwertEur);
  const gewichteStueck = positionen.map((p) => p.menge);

  // Anteile je Position aufsummieren, eine Nebenkostenrechnung nach der anderen.
  const anteile = positionen.map(() => 0);
  for (const nk of nebenkosten) {
    pruefeCent(nk.betragEur, `Nebenkosten "${nk.bezeichnung}"`);
    if (nk.betragEur === 0) continue;
    const gewichte =
      nk.verteilmethode === 'stueckzahl' ? gewichteStueck : gewichteWert;
    const verteilt = verteileNachGewicht(nk.betragEur, gewichte);
    for (let i = 0; i < anteile.length; i += 1) {
      anteile[i] = (anteile[i] ?? 0) + (verteilt[i] ?? 0);
    }
  }

  const ergebnisPositionen: VerteilteNebenkosten[] = positionen.map((p, i) => {
    const nebenkostenEur = anteile[i] ?? 0;
    const einstandGesamtEur = p.warenwertEur + nebenkostenEur;
    const einstandspreisEur = runde(einstandGesamtEur / p.menge);
    const rundungsdifferenzEur = einstandGesamtEur - einstandspreisEur * p.menge;
    return {
      chargeId: p.id,
      nebenkostenEur,
      einstandGesamtEur,
      einstandspreisEur,
      rundungsdifferenzEur,
    };
  });

  return {
    positionen: ergebnisPositionen,
    nebenkostenGesamtEur: summe(nebenkosten.map((n) => n.betragEur)),
    warenwertGesamtEur: summe(gewichteWert),
  };
}

/**
 * Einstandspreis je Stueck fuer eine einzelne Position ohne Sendungskontext.
 *
 * Bequemlichkeitsfunktion fuer den haeufigen Fall, dass ein Wareneingang nur
 * eine Position enthaelt. Sie ruft dieselbe Verteilung auf, damit es keinen
 * zweiten Rechenweg gibt, der auseinanderlaufen koennte.
 */
export function einstandspreisJeStueck(
  position: ChargePosition,
  nebenkosten: readonly Nebenkosten[] = [],
): Cent {
  const ergebnis = verteileNebenkosten([position], nebenkosten);
  /* c8 ignore next */
  return ergebnis.positionen[0]?.einstandspreisEur ?? 0;
}
