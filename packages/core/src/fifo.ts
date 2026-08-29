/**
 * FIFO-Chargenzuordnung.
 *
 * Bei einem Abgang wird zuerst die aelteste Charge mit Restmenge verbraucht.
 * Ein Abgang kann sich ueber mehrere Chargen erstrecken (Regel 9). Die
 * Zuordnungen werden anschliessend als eigene Zeilen persistiert, damit
 * Stornos und Retouren exakt dorthin zurueckbuchen, wo die Ware herkam.
 *
 * Alle Funktionen hier sind rein: die uebergebenen Chargen werden nie
 * veraendert, es entsteht stets eine neue Liste. Das macht die Vorschau im
 * Kalkulator gefahrlos – man kann einen Abgang durchrechnen, ohne etwas
 * zu buchen.
 */

import type { Cent } from './money.js';
import { runde } from './money.js';
import type { Charge, Chargenzuordnung, FifoErgebnis } from './types.js';

export class FifoFehler extends Error {
  constructor(nachricht: string) {
    super(nachricht);
    this.name = 'FifoFehler';
  }
}

/**
 * Sortiert Chargen in Verbrauchsreihenfolge: aeltester Wareneingang zuerst.
 * Bei identischem Zeitstempel entscheidet die id, damit die Reihenfolge
 * stabil und damit reproduzierbar ist – zwei Chargen aus derselben Lieferung
 * duerfen nicht je nach Datenbankreihenfolge unterschiedlich verbraucht werden.
 */
export function sortiereFifo(chargen: readonly Charge[]): Charge[] {
  return [...chargen].sort((a, b) => {
    const diff = a.wareneingangAm.getTime() - b.wareneingangAm.getTime();
    if (diff !== 0) return diff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Summe der Restmengen. */
export function verfuegbareMenge(chargen: readonly Charge[]): number {
  return chargen.reduce((s, c) => s + c.mengeRest, 0);
}

/**
 * Ordnet einen Abgang nach FIFO den vorhandenen Chargen zu.
 *
 * Reicht der Bestand nicht aus, wirft die Funktion nicht, sondern weist die
 * Fehlmenge als `ungedeckteMenge` aus. Ob ein Abgang ins Minus laufen darf,
 * ist eine fachliche Entscheidung der aufrufenden Ebene – Schwund und
 * Inventurdifferenzen erfordern gelegentlich genau das. Die Engine bleibt
 * an dieser Stelle bewusst wertfrei.
 *
 * Der Wareneinsatz wird ueber die Einzelzuordnungen summiert. Da jeder
 * Chargen-Einstandspreis bereits ein gerundeter Cent-Wert ist, ist die Summe
 * ganzzahlig; `runde` ist hier reine Absicherung.
 */
export function ordneAbgangZu(
  chargen: readonly Charge[],
  menge: number,
): FifoErgebnis {
  if (!Number.isInteger(menge) || menge <= 0) {
    throw new FifoFehler(
      `Abgangsmenge muss eine positive Ganzzahl sein, erhalten: ${String(menge)}`,
    );
  }

  const sortiert = sortiereFifo(chargen);
  const zuordnungen: Chargenzuordnung[] = [];
  const nachher: Charge[] = [];
  let offen = menge;
  let wareneinsatz = 0;

  for (const charge of sortiert) {
    if (offen === 0 || charge.mengeRest <= 0) {
      nachher.push(charge);
      continue;
    }
    const entnahme = Math.min(charge.mengeRest, offen);
    zuordnungen.push({
      chargeId: charge.id,
      menge: entnahme,
      einstandspreisEur: charge.einstandspreisEur,
    });
    wareneinsatz += entnahme * charge.einstandspreisEur;
    offen -= entnahme;
    nachher.push({ ...charge, mengeRest: charge.mengeRest - entnahme });
  }

  return {
    zuordnungen,
    chargenNachher: nachher,
    wareneinsatzEur: runde(wareneinsatz),
    ungedeckteMenge: offen,
  };
}

/**
 * Bucht Zuordnungen zurueck – fuer Retouren und Stornos.
 *
 * Die Ware landet exakt in der Charge, aus der sie stammt. Genau dafuer werden
 * die Zuordnungen ueberhaupt persistiert: eine Retoure zum Tagespreis oder
 * zum Durchschnitt wuerde den Wareneinsatz vergangener Perioden verfaelschen.
 *
 * Eine Rueckbuchung ueber die urspruengliche Eingangsmenge hinaus wird
 * abgelehnt, weil sie bedeuten wuerde, dass mehr zurueckkommt als je
 * geliefert wurde.
 */
export function bucheZurueck(
  chargen: readonly Charge[],
  zuordnungen: readonly Chargenzuordnung[],
): Charge[] {
  const nachId = new Map(chargen.map((c) => [c.id, c]));

  for (const z of zuordnungen) {
    if (!Number.isInteger(z.menge) || z.menge <= 0) {
      throw new FifoFehler(
        `Rueckbuchungsmenge muss eine positive Ganzzahl sein, erhalten: ${String(z.menge)}`,
      );
    }
    const charge = nachId.get(z.chargeId);
    if (charge === undefined) {
      throw new FifoFehler(
        `Charge ${z.chargeId} ist nicht bekannt und kann nichts zurueckerhalten.`,
      );
    }
    const neu = charge.mengeRest + z.menge;
    if (neu > charge.mengeEingang) {
      throw new FifoFehler(
        `Charge ${z.chargeId}: Rueckbuchung von ${z.menge} ueberschreitet die Eingangsmenge ` +
          `(Rest ${charge.mengeRest}, Eingang ${charge.mengeEingang}).`,
      );
    }
    nachId.set(z.chargeId, { ...charge, mengeRest: neu });
  }

  return chargen.map((c) => nachId.get(c.id) ?? c);
}

/**
 * Wert des Bestands zu Einstandspreisen.
 *
 * Nicht zu verwechseln mit dem Wareneinsatz: dieser Wert bezieht sich auf das,
 * was noch liegt, nicht auf das, was abgegangen ist.
 */
export function bestandswert(chargen: readonly Charge[]): Cent {
  return runde(
    chargen.reduce((s, c) => s + c.mengeRest * c.einstandspreisEur, 0),
  );
}

/**
 * Gewichteter durchschnittlicher Einstandspreis des Restbestands.
 *
 * Dient nur der Anzeige. Bewertet und gebucht wird ausschliesslich nach FIFO;
 * ein Durchschnittspreis wuerde die Chargenzuordnung aufweichen.
 * Ohne Restbestand ist das Ergebnis 0.
 */
export function durchschnittlicherEinstand(chargen: readonly Charge[]): Cent {
  const menge = verfuegbareMenge(chargen);
  if (menge <= 0) return 0;
  return runde(bestandswert(chargen) / menge);
}
