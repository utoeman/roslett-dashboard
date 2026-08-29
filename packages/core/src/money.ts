/**
 * Geldarithmetik.
 *
 * Grundregel des gesamten Systems: Betraege leben intern ausschliesslich als
 * ganzzahlige Cent vom Typ `number`. Fliesskomma wird nur an der Systemgrenze
 * beruehrt – beim Parsen einer Nutzereingabe, beim Formatieren fuer die
 * Anzeige und beim Lesen aus der Datenbank. Alles dazwischen ist Ganzzahl.
 *
 * `number` traegt Ganzzahlen exakt bis 2^53-1. Das entspricht rund
 * 90 Billionen Euro in Cent und ist fuer diesen Anwendungsfall reichlich.
 */

/** Ganzzahlige Cent. Nominaler Typ, damit blanke Zahlen nicht versehentlich durchrutschen. */
export type Cent = number;

/**
 * Ein Verhaeltnis als Dezimalzahl: 0.35 bedeutet 35 Prozent.
 * Prozentsaetze sind bewusst kein Cent-Typ – sie sind kein Geld und
 * duerfen zwischendrin volle Fliesskommagenauigkeit behalten (Regel 10).
 */
export type Satz = number;

export class GeldFehler extends Error {
  constructor(nachricht: string) {
    super(nachricht);
    this.name = 'GeldFehler';
  }
}

const ZWEI_HOCH_53 = Number.MAX_SAFE_INTEGER;

/** Prueft, ob ein Wert ein gueltiger Cent-Betrag ist (ganzzahlig, endlich, im sicheren Bereich). */
export function istCent(wert: unknown): wert is Cent {
  return (
    typeof wert === 'number' &&
    Number.isInteger(wert) &&
    Math.abs(wert) <= ZWEI_HOCH_53
  );
}

/** Wirft, wenn `wert` kein gueltiger Cent-Betrag ist. Gibt ihn andernfalls zurueck. */
export function pruefeCent(wert: number, feld = 'Betrag'): Cent {
  if (!istCent(wert)) {
    throw new GeldFehler(
      `${feld} muss ein ganzzahliger Cent-Wert sein, erhalten: ${String(wert)}`,
    );
  }
  return wert;
}

/**
 * Kaufmaennische Rundung auf die Ganzzahl, symmetrisch um null.
 *
 * `Math.round` rundet -0.5 auf -0, also zur Null hin, waehrend +0.5 von der
 * Null weg gerundet wird. Diese Asymmetrie ist bei Gutschriften und
 * Retouren falsch, deshalb der eigene Weg ueber den Betrag.
 */
export function runde(wert: number): Cent {
  if (!Number.isFinite(wert)) {
    throw new GeldFehler(`Nicht rundbarer Wert: ${String(wert)}`);
  }
  const vorzeichen = wert < 0 ? -1 : 1;
  return vorzeichen * Math.round(Math.abs(wert));
}

/**
 * Wandelt Euro (Fliesskomma) in Cent. Nur an der Systemgrenze verwenden.
 *
 * Der Umweg ueber `toFixed` faengt Faelle wie 19.99 * 100 = 1998.9999999999998 ab,
 * die bei direkter Multiplikation einen Cent verlieren wuerden.
 */
export function euroZuCent(euro: number): Cent {
  if (!Number.isFinite(euro)) {
    throw new GeldFehler(`Kein gueltiger Euro-Betrag: ${String(euro)}`);
  }
  return runde(Number.parseFloat((euro * 100).toFixed(4)));
}

/** Wandelt Cent in Euro als Fliesskomma. Nur fuer Anzeige und Systemgrenze. */
export function centZuEuro(cent: Cent): number {
  pruefeCent(cent);
  return cent / 100;
}

/**
 * Parst eine Nutzereingabe zu Cent.
 *
 * Akzeptiert deutsche und englische Schreibweise: "1.234,56", "1,234.56",
 * "1234,56", "1234.56", "12", "-3,40", "€ 9,99". Die Unterscheidung laeuft
 * ueber das *letzte* auftretende Trennzeichen: es gilt als Dezimaltrenner,
 * alle uebrigen als Tausenderpunkte. Bei einem einzelnen Trennzeichen mit
 * genau drei Nachkommastellen ("1.234") wird es als Tausendertrenner gelesen,
 * weil das im deutschen Sprachraum die weit haeufigere Absicht ist.
 */
export function parseGeld(eingabe: string): Cent {
  const roh = eingabe.trim();
  if (roh === '') {
    throw new GeldFehler('Leere Eingabe ist kein Betrag.');
  }

  // Waehrungssymbole, Codes und Leerzeichen entfernen.
  let text = roh.replace(/[€$£\s]/g, '').replace(/(EUR|USD|GBP)/gi, '');

  let negativ = false;
  if (text.startsWith('-')) {
    negativ = true;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }
  // Buchhalterische Klammerschreibweise: (12,50) bedeutet -12,50.
  if (text.startsWith('(') && text.endsWith(')')) {
    negativ = true;
    text = text.slice(1, -1);
  }

  if (!/^[\d.,]+$/.test(text)) {
    throw new GeldFehler(`Kein gueltiger Betrag: "${eingabe}"`);
  }

  const letzterPunkt = text.lastIndexOf('.');
  const letztesKomma = text.lastIndexOf(',');
  const trennerPos = Math.max(letzterPunkt, letztesKomma);

  let ganz: string;
  let bruch: string;

  if (trennerPos === -1) {
    ganz = text;
    bruch = '';
  } else {
    const nachTrenner = text.slice(trennerPos + 1);
    // trennerPos stammt aus lastIndexOf und liegt damit im gueltigen Bereich;
    // der Fallback befriedigt nur noUncheckedIndexedAccess.
    const trenner = text.charAt(trennerPos);
    // Genau drei Ziffern hinter einem einzelnen Punkt oder Komma:
    // Tausendertrenner, nicht Dezimaltrenner.
    const nurEinTrenner =
      text.indexOf(trenner) === trennerPos &&
      (trenner === '.' ? letztesKomma : letzterPunkt) === -1;
    if (nachTrenner.length === 3 && nurEinTrenner) {
      ganz = text.replace(/[.,]/g, '');
      bruch = '';
    } else {
      ganz = text.slice(0, trennerPos).replace(/[.,]/g, '');
      bruch = nachTrenner;
    }
  }

  if (!/^\d*$/.test(bruch)) {
    throw new GeldFehler(`Kein gueltiger Betrag: "${eingabe}"`);
  }

  const ganzZahl = ganz === '' ? 0 : Number.parseInt(ganz, 10);
  if (!Number.isFinite(ganzZahl)) {
    throw new GeldFehler(`Kein gueltiger Betrag: "${eingabe}"`);
  }

  // Nachkommastellen jenseits der zweiten werden gerundet, nicht abgeschnitten.
  const bruchGefuellt = (bruch + '00').slice(0, 2);
  const bruchCent = Number.parseInt(bruchGefuellt, 10);
  const rest = bruch.length > 2 ? Number.parseFloat('0.' + bruch.slice(2)) : 0;

  const cent = runde(ganzZahl * 100 + bruchCent + rest);
  return negativ ? -cent : cent;
}

/** Formatiert Cent als deutschen Geldstring, standardmaessig mit Euro-Zeichen. */
export function formatGeld(
  cent: Cent,
  optionen: { waehrung?: string; mitSymbol?: boolean } = {},
): string {
  pruefeCent(cent);
  const { waehrung = 'EUR', mitSymbol = true } = optionen;
  return new Intl.NumberFormat('de-DE', {
    style: mitSymbol ? 'currency' : 'decimal',
    currency: waehrung,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cent / 100);
}

/** Formatiert einen Satz (0.35) als Prozentangabe ("35,0 %"). */
export function formatProzent(satz: Satz, nachkommastellen = 1): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'percent',
    minimumFractionDigits: nachkommastellen,
    maximumFractionDigits: nachkommastellen,
  }).format(satz);
}

/**
 * Rechnet einen Fremdwaehrungsbetrag mit eingefrorenem Kurs in Euro-Cent um.
 *
 * `kurs` ist der Wert einer Einheit Fremdwaehrung in Euro: bei 1 USD = 0,92 EUR
 * lautet der Kurs 0.92. Das Ergebnis wird sofort gerundet, weil es persistiert
 * wird und damit das Ende einer Rechenkette bildet (Regel 6 und 10).
 */
export function fremdZuEur(betragFremd: Cent, kurs: number): Cent {
  pruefeCent(betragFremd, 'Fremdwaehrungsbetrag');
  if (!Number.isFinite(kurs) || kurs <= 0) {
    throw new GeldFehler(`Wechselkurs muss groesser als null sein, erhalten: ${String(kurs)}`);
  }
  return runde(betragFremd * kurs);
}

/** Summiert Cent-Betraege. Leere Liste ergibt 0. */
export function summe(betraege: readonly Cent[]): Cent {
  let s = 0;
  for (const b of betraege) {
    s += pruefeCent(b);
  }
  return s;
}

/**
 * Wendet einen Prozentsatz auf einen Betrag an, ohne zu runden.
 * Das Runden gehoert ans Ende der Kette, nicht hierher (Regel 10).
 */
export function anteil(betrag: Cent, satz: Satz): number {
  pruefeCent(betrag);
  if (!Number.isFinite(satz)) {
    throw new GeldFehler(`Kein gueltiger Satz: ${String(satz)}`);
  }
  return betrag * satz;
}

/**
 * Verteilt einen Betrag restfrei nach Gewichten.
 *
 * Das ist die zentrale Hilfsfunktion der Nebenkostenverteilung. Naives
 * Runden jedes Einzelanteils verliert oder erfindet Cent; hier wird zuerst
 * abgerundet und der Rundungsrest anschliessend Cent fuer Cent an die
 * Positionen mit dem groessten Nachkommaanteil vergeben. Die Summe der
 * Ergebnisse entspricht damit exakt dem Eingangsbetrag.
 *
 * Bei Gleichstand entscheidet der kleinere Index, damit das Ergebnis
 * deterministisch und damit testbar bleibt.
 *
 * Sind alle Gewichte null, wird gleichmaessig verteilt – sonst waere das
 * Ergebnis undefiniert und der Betrag ginge verloren.
 */
export function verteileNachGewicht(
  betrag: Cent,
  gewichte: readonly number[],
): Cent[] {
  pruefeCent(betrag, 'Zu verteilender Betrag');
  if (gewichte.length === 0) {
    throw new GeldFehler('Ohne Positionen laesst sich kein Betrag verteilen.');
  }
  for (const g of gewichte) {
    if (!Number.isFinite(g) || g < 0) {
      throw new GeldFehler(`Gewicht muss endlich und nicht negativ sein, erhalten: ${String(g)}`);
    }
  }

  const gesamtgewicht = gewichte.reduce((a, b) => a + b, 0);
  const effektiv =
    gesamtgewicht === 0 ? gewichte.map(() => 1) : (gewichte as number[]);
  const effektivGesamt = gesamtgewicht === 0 ? gewichte.length : gesamtgewicht;

  const exakt = effektiv.map((g) => (betrag * g) / effektivGesamt);
  // Zur Null hin abschneiden, damit die Verteilung bei negativen Betraegen
  // (Korrekturen, Gutschriften) spiegelbildlich zur positiven laeuft.
  const abgerundet = exakt.map((w) => Math.trunc(w));
  const verteilt = abgerundet.reduce((a, b) => a + b, 0);
  let rest = betrag - verteilt;

  const nachIndex = exakt
    .map((w, i) => ({ i, bruch: Math.abs(w - Math.trunc(w)) }))
    .sort((a, b) => b.bruch - a.bruch || a.i - b.i);

  const ergebnis = [...abgerundet];
  const schritt = rest < 0 ? -1 : 1;
  let pos = 0;
  while (rest !== 0) {
    const eintrag = nachIndex[pos % nachIndex.length];
    /* c8 ignore next */
    if (eintrag === undefined) break;
    ergebnis[eintrag.i] = (ergebnis[eintrag.i] ?? 0) + schritt;
    rest -= schritt;
    pos += 1;
  }

  return ergebnis;
}
