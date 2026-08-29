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
 * Kalkulator gefahrlos – man kann einen Abgang durchrechnen, ohne etwas zu
 * buchen.
 */

import type { Cents } from './money.js';
import { round } from './money.js';
import type { Batch, BatchAllocation, FifoResult } from './types.js';

export class FifoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FifoError';
  }
}

/**
 * Sortiert Chargen in Verbrauchsreihenfolge: aeltester Wareneingang zuerst.
 * Bei identischem Zeitstempel entscheidet die id, damit die Reihenfolge
 * stabil und damit reproduzierbar ist – zwei Chargen aus derselben Lieferung
 * duerfen nicht je nach Datenbankreihenfolge unterschiedlich verbraucht werden.
 */
export function sortFifo(batches: readonly Batch[]): Batch[] {
  return [...batches].sort((a, b) => {
    const diff = a.receivedAt.getTime() - b.receivedAt.getTime();
    if (diff !== 0) return diff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Summe der Restmengen. */
export function availableQuantity(batches: readonly Batch[]): number {
  return batches.reduce((total, batch) => total + batch.quantityRemaining, 0);
}

/**
 * Ordnet einen Abgang nach FIFO den vorhandenen Chargen zu.
 *
 * Reicht der Bestand nicht aus, wirft die Funktion nicht, sondern weist die
 * Fehlmenge als `uncoveredQuantity` aus. Ob ein Abgang ins Minus laufen darf,
 * ist eine fachliche Entscheidung der aufrufenden Ebene – Schwund und
 * Inventurdifferenzen erfordern gelegentlich genau das. Die Engine bleibt an
 * dieser Stelle bewusst wertfrei.
 *
 * Der Wareneinsatz wird ueber die Einzelzuordnungen summiert. Da jeder
 * Chargen-Einstandspreis bereits ein gerundeter Cent-Wert ist, ist die Summe
 * ganzzahlig; `round` ist hier reine Absicherung.
 */
export function allocateIssue(
  batches: readonly Batch[],
  quantity: number,
): FifoResult {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new FifoError(
      `Abgangsmenge muss eine positive Ganzzahl sein, erhalten: ${String(quantity)}`,
    );
  }

  const sorted = sortFifo(batches);
  const allocations: BatchAllocation[] = [];
  const after: Batch[] = [];
  let open = quantity;
  let costOfGoodsSold = 0;

  for (const batch of sorted) {
    if (open === 0 || batch.quantityRemaining <= 0) {
      after.push(batch);
      continue;
    }
    const taken = Math.min(batch.quantityRemaining, open);
    allocations.push({
      batchId: batch.id,
      quantity: taken,
      landedCostEur: batch.landedCostEur,
    });
    costOfGoodsSold += taken * batch.landedCostEur;
    open -= taken;
    after.push({ ...batch, quantityRemaining: batch.quantityRemaining - taken });
  }

  return {
    allocations,
    batchesAfter: after,
    costOfGoodsSoldEur: round(costOfGoodsSold),
    uncoveredQuantity: open,
  };
}

/**
 * Bucht Zuordnungen zurueck – fuer Retouren und Stornos.
 *
 * Die Ware landet exakt in der Charge, aus der sie stammt. Genau dafuer
 * werden die Zuordnungen ueberhaupt persistiert: eine Retoure zum Tagespreis
 * oder zum Durchschnitt wuerde den Wareneinsatz vergangener Perioden
 * verfaelschen.
 *
 * Eine Rueckbuchung ueber die urspruengliche Eingangsmenge hinaus wird
 * abgelehnt, weil sie bedeuten wuerde, dass mehr zurueckkommt als je
 * geliefert wurde.
 */
export function returnToBatches(
  batches: readonly Batch[],
  allocations: readonly BatchAllocation[],
): Batch[] {
  const byId = new Map(batches.map((batch) => [batch.id, batch]));

  for (const allocation of allocations) {
    if (!Number.isInteger(allocation.quantity) || allocation.quantity <= 0) {
      throw new FifoError(
        `Rueckbuchungsmenge muss eine positive Ganzzahl sein, erhalten: ${String(allocation.quantity)}`,
      );
    }
    const batch = byId.get(allocation.batchId);
    if (batch === undefined) {
      throw new FifoError(
        `Charge ${allocation.batchId} ist nicht bekannt und kann nichts zurueckerhalten.`,
      );
    }
    const updated = batch.quantityRemaining + allocation.quantity;
    if (updated > batch.quantityReceived) {
      throw new FifoError(
        `Charge ${allocation.batchId}: Rueckbuchung von ${allocation.quantity} ueberschreitet die Eingangsmenge ` +
          `(Rest ${batch.quantityRemaining}, Eingang ${batch.quantityReceived}).`,
      );
    }
    byId.set(allocation.batchId, { ...batch, quantityRemaining: updated });
  }

  return batches.map((batch) => byId.get(batch.id) ?? batch);
}

/**
 * Wert des Bestands zu Einstandspreisen.
 *
 * Nicht zu verwechseln mit dem Wareneinsatz: dieser Wert bezieht sich auf
 * das, was noch liegt, nicht auf das, was abgegangen ist.
 */
export function stockValue(batches: readonly Batch[]): Cents {
  return round(
    batches.reduce(
      (total, batch) => total + batch.quantityRemaining * batch.landedCostEur,
      0,
    ),
  );
}

/**
 * Gewichteter durchschnittlicher Einstandspreis des Restbestands.
 *
 * Dient nur der Anzeige. Bewertet und gebucht wird ausschliesslich nach
 * FIFO; ein Durchschnittspreis wuerde die Chargenzuordnung aufweichen.
 * Ohne Restbestand ist das Ergebnis 0.
 */
export function averageLandedCost(batches: readonly Batch[]): Cents {
  const quantity = availableQuantity(batches);
  if (quantity <= 0) return 0;
  return round(stockValue(batches) / quantity);
}
