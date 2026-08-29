/**
 * Preis- und Margenrechnung.
 *
 * Alles hier laeuft netto (Regel 2). Umsatzsteuer ist bei einem
 * regelbesteuerten Unternehmen ein durchlaufender Posten und beruehrt die
 * Marge nicht. Sie taucht in diesem Modul deshalb gar nicht auf.
 */

import type { Cent, Satz } from './money.js';
import { anteil, formatProzent, pruefeCent, runde } from './money.js';
import type {
  Kanal,
  KanalpreisErgebnis,
  Kostenposition,
  Kostenzeile,
  MargenErgebnis,
  SelbstkostenErgebnis,
} from './types.js';

export class PreisFehler extends Error {
  constructor(nachricht: string) {
    super(nachricht);
    this.name = 'PreisFehler';
  }
}

/**
 * Waehlt die Kostenpositionen aus, die fuer eine Variante gelten:
 * alle aktiven globalen plus alle aktiven der Variante selbst.
 */
export function positionenFuerVariante(
  positionen: readonly Kostenposition[],
  varianteId: string,
): Kostenposition[] {
  return positionen.filter(
    (p) => p.aktiv && (p.varianteId === null || p.varianteId === varianteId),
  );
}

/**
 * Berechnet die Selbstkosten je Stueck aus Einstandspreis und Kostenpositionen.
 *
 * Prozentuale Positionen beziehen sich hier auf den Einstandspreis, nicht auf
 * den Verkaufspreis. Kosten, die am Verkaufspreis haengen – Kanalgebuehren
 * etwa – sind keine Selbstkosten, sondern gehen in die Rueckwaertsrechnung
 * ein, weil sie den gesuchten Preis voraussetzen.
 *
 * Vorsteuerabzugsfaehige Positionen werden zwar ausgewiesen, aber nicht
 * eingerechnet (Regel 3). Die Einfuhrumsatzsteuer ist der Standardfall:
 * sie wird gezahlt, aber zurueckgeholt und belastet die Marge nicht. Zoll
 * hingegen ist nicht abzugsfaehig und zaehlt voll mit.
 *
 * Gerundet wird erst am Schluss (Regel 10): die prozentualen Anteile bleiben
 * bis zur Summenbildung Fliesskomma.
 */
export function berechneSelbstkosten(
  einstandspreisEur: Cent,
  positionen: readonly Kostenposition[],
): SelbstkostenErgebnis {
  pruefeCent(einstandspreisEur, 'Einstandspreis');

  const zeilen: Kostenzeile[] = [];
  let aufschlagend = 0;
  let vorsteuer = 0;

  for (const p of positionen) {
    if (!p.aktiv) continue;
    const roh =
      p.art === 'prozent'
        ? anteil(einstandspreisEur, p.wert)
        : pruefeCent(p.wert, `Kostenposition "${p.bezeichnung}"`);

    if (p.vorsteuerabzugsfaehig) {
      vorsteuer += roh;
    } else {
      aufschlagend += roh;
    }

    zeilen.push({
      bezeichnung: p.bezeichnung,
      betragEur: runde(roh),
      ausgenommen: p.vorsteuerabzugsfaehig,
    });
  }

  return {
    einstandspreisEur,
    zeilen,
    selbstkostenEur: runde(einstandspreisEur + aufschlagend),
    vorsteuerEur: runde(vorsteuer),
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
export function berechneMarge(
  verkaufspreisNettoEur: Cent,
  selbstkostenEur: Cent,
): MargenErgebnis {
  pruefeCent(verkaufspreisNettoEur, 'Verkaufspreis');
  pruefeCent(selbstkostenEur, 'Selbstkosten');

  const deckungsbeitrag = verkaufspreisNettoEur - selbstkostenEur;

  return {
    verkaufspreisNettoEur,
    selbstkostenEur,
    deckungsbeitragEur: deckungsbeitrag,
    marge:
      verkaufspreisNettoEur === 0
        ? 0
        : deckungsbeitrag / verkaufspreisNettoEur,
    aufschlag: selbstkostenEur === 0 ? 0 : deckungsbeitrag / selbstkostenEur,
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
export function berechneVerkaufspreis(parameter: {
  selbstkostenEur: Cent;
  zielmarge: Satz;
  gebuehrProzent?: Satz;
  gebuehrFixEur?: Cent;
}): Cent {
  const {
    selbstkostenEur,
    zielmarge,
    gebuehrProzent = 0,
    gebuehrFixEur = 0,
  } = parameter;

  pruefeCent(selbstkostenEur, 'Selbstkosten');
  pruefeCent(gebuehrFixEur, 'Fixgebuehr');

  if (!Number.isFinite(zielmarge)) {
    throw new PreisFehler(`Zielmarge ist keine gueltige Zahl: ${String(zielmarge)}`);
  }
  if (!Number.isFinite(gebuehrProzent) || gebuehrProzent < 0) {
    throw new PreisFehler(
      `Gebuehrensatz muss endlich und nicht negativ sein, erhalten: ${String(gebuehrProzent)}`,
    );
  }
  if (zielmarge >= 1) {
    throw new PreisFehler(
      `Eine Zielmarge von ${formatProzent(zielmarge)} ist nicht erreichbar: ` +
        'die Marge muss unter 100 % liegen, weil der Deckungsbeitrag Teil des Verkaufspreises ist.',
    );
  }

  const nenner = 1 - zielmarge - gebuehrProzent;
  if (nenner <= 0) {
    // Fehlermeldungen werden dem Nutzer im Kalkulator angezeigt und muessen
    // deshalb deutsch formatiert sein, also mit Komma als Dezimaltrenner.
    throw new PreisFehler(
      `Zielmarge ${formatProzent(zielmarge)} und Gebuehren ` +
        `${formatProzent(gebuehrProzent)} ergeben zusammen ` +
        `${formatProzent(zielmarge + gebuehrProzent)} und lassen damit nichts ` +
        'fuer die Selbstkosten uebrig. Es gibt keinen Verkaufspreis, der diese Vorgabe erfuellt. ' +
        'Zielmarge senken oder einen guenstigeren Kanal waehlen.',
    );
  }

  return runde((selbstkostenEur + gebuehrFixEur) / nenner);
}

/**
 * Kanalpreis fuer eine Variante.
 *
 * Bei `preisregel: 'gleiche_marge'` wird der Preis so zurueckgerechnet, dass
 * nach Abzug der Kanalgebuehren die Zielmarge stehen bleibt. Bei
 * `preisregel: 'fest'` gilt der uebergebene Preis, und berechnet wird nur,
 * was davon uebrig bleibt – dann kann die tatsaechliche Marge unter der
 * Zielmarge liegen, was der Kalkulator so auch anzeigen soll.
 */
export function berechneKanalpreis(parameter: {
  kanal: Kanal;
  selbstkostenEur: Cent;
  zielmarge: Satz;
  festpreisEur?: Cent;
}): KanalpreisErgebnis {
  const { kanal, selbstkostenEur, zielmarge, festpreisEur } = parameter;
  pruefeCent(selbstkostenEur, 'Selbstkosten');

  let verkaufspreis: Cent;
  if (kanal.preisregel === 'fest') {
    if (festpreisEur === undefined) {
      throw new PreisFehler(
        `Kanal "${kanal.name}" hat die Preisregel "fest", es wurde aber kein Festpreis uebergeben.`,
      );
    }
    verkaufspreis = pruefeCent(festpreisEur, 'Festpreis');
  } else {
    verkaufspreis = berechneVerkaufspreis({
      selbstkostenEur,
      zielmarge,
      gebuehrProzent: kanal.gebuehrProzent,
      gebuehrFixEur: kanal.gebuehrFix,
    });
  }

  // Erst hier runden: der prozentuale Gebuehrenanteil bleibt bis zur
  // Summenbildung mit der Fixgebuehr ungerundet (Regel 10).
  const gebuehren = runde(
    anteil(verkaufspreis, kanal.gebuehrProzent) + kanal.gebuehrFix,
  );
  const deckungsbeitrag = verkaufspreis - selbstkostenEur - gebuehren;

  return {
    kanalId: kanal.id,
    kanalName: kanal.name,
    verkaufspreisNettoEur: verkaufspreis,
    gebuehrenEur: gebuehren,
    selbstkostenEur,
    deckungsbeitragEur: deckungsbeitrag,
    marge: verkaufspreis === 0 ? 0 : deckungsbeitrag / verkaufspreis,
    aufschlag: selbstkostenEur === 0 ? 0 : deckungsbeitrag / selbstkostenEur,
  };
}

/**
 * Zielmarge, die noetig ist, um bei gegebenem Verkaufspreis und Kanal
 * kostendeckend zu bleiben. Nuetzlich fuer die Warnschwelle im Regler.
 */
export function mindestmarge(
  selbstkostenEur: Cent,
  kanal: Pick<Kanal, 'gebuehrProzent' | 'gebuehrFix'>,
  verkaufspreisNettoEur: Cent,
): Satz {
  pruefeCent(selbstkostenEur, 'Selbstkosten');
  pruefeCent(verkaufspreisNettoEur, 'Verkaufspreis');
  if (verkaufspreisNettoEur === 0) return 0;
  const gebuehren =
    anteil(verkaufspreisNettoEur, kanal.gebuehrProzent) + kanal.gebuehrFix;
  return (verkaufspreisNettoEur - selbstkostenEur - gebuehren) / verkaufspreisNettoEur;
}
