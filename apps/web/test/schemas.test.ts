/**
 * Tests der Systemgrenze.
 *
 * Hier wird geprueft, was zwischen Formular und Datenbank passiert: das
 * Parsen von Eingaben zu ganzzahligen Cent (Regel 1) und die Umrechnung
 * fuer die Datenbankspalten. Genau an dieser Grenze entstehen die Fehler,
 * die man in der Oberflaeche nicht sieht.
 */

import { describe, expect, it } from 'vitest';
import {
  flagSchema,
  geldSchema,
  listenAbfrageSchema,
  optionalerText,
  pflichttext,
  prozentSchema,
} from '../shared/schemas/gemeinsam.js';
import { skuSchema, produktAnlegenSchema } from '../shared/schemas/artikel.js';
import {
  kostenpositionAendernSchema,
  kostenpositionAnlegenSchema,
} from '../shared/schemas/kostenposition.js';
import {
  kanalAendernSchema,
  kanalAnlegenSchema,
} from '../shared/schemas/kanal.js';
import {
  centZuNumeric,
  numericZuCent,
  numericZuSatz,
  satzZuNumeric,
} from '../server/utils/geld.js';

describe('flagSchema – Wahrheitswerte aus der Abfragezeichenkette', () => {
  const schema = flagSchema();

  it('liest "false" als falsch', () => {
    // Der eigentliche Grund fuer diesen Baustein: z.coerce.boolean() macht
    // aus "false" ein true, weil jede nicht leere Zeichenkette truthy ist.
    // Damit waere jeder Filter wirkungslos.
    expect(schema.parse('false')).toBe(false);
    expect(schema.parse('0')).toBe(false);
  });

  it('liest "true" als wahr', () => {
    expect(schema.parse('true')).toBe(true);
    expect(schema.parse('1')).toBe(true);
  });

  it('nimmt echte Wahrheitswerte unveraendert', () => {
    expect(schema.parse(true)).toBe(true);
    expect(schema.parse(false)).toBe(false);
  });

  it('traegt selbst keinen Standardwert', () => {
    // Der Standard wird bewusst an der Aufrufstelle gesetzt: ein
    // `.default()` im Baustein wuerde ein aeusseres `.optional()`
    // aushebeln und bei PATCH Daten ueberschreiben.
    expect(schema.safeParse(undefined).success).toBe(false);
    expect(schema.default(true).parse(undefined)).toBe(true);
    expect(schema.default(false).parse(undefined)).toBe(false);
  });
});

describe('listenAbfrageSchema', () => {
  it('blendet Archivierte standardmaessig aus', () => {
    expect(listenAbfrageSchema.parse({}).mitArchivierten).toBe(false);
  });

  it('respektiert mitArchivierten=false aus der Abfragezeichenkette', () => {
    // Genau der Weg, den die Oberflaeche nimmt.
    const ergebnis = listenAbfrageSchema.parse({ mitArchivierten: 'false' });
    expect(ergebnis.mitArchivierten).toBe(false);
  });

  it('respektiert mitArchivierten=true', () => {
    expect(
      listenAbfrageSchema.parse({ mitArchivierten: 'true' }).mitArchivierten,
    ).toBe(true);
  });

  it('setzt sinnvolle Grenzen', () => {
    expect(listenAbfrageSchema.parse({}).limit).toBe(100);
    expect(listenAbfrageSchema.safeParse({ limit: '9999' }).success).toBe(false);
    expect(listenAbfrageSchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(listenAbfrageSchema.safeParse({ offset: '-1' }).success).toBe(false);
  });
});

describe('geldSchema – Eingabe zu ganzzahligen Cent (Regel 1)', () => {
  const schema = geldSchema('Betrag');

  it('liest deutsche Schreibweise', () => {
    expect(schema.parse('24,90')).toBe(2490);
    expect(schema.parse('1.234,56')).toBe(123456);
    expect(schema.parse('0,85')).toBe(85);
    expect(schema.parse('0,05')).toBe(5);
  });

  it('liest englische Schreibweise', () => {
    expect(schema.parse('1,234.56')).toBe(123456);
    expect(schema.parse('24.90')).toBe(2490);
  });

  it('nimmt Zahlen als Euro-Betraege', () => {
    expect(schema.parse(24.9)).toBe(2490);
    expect(schema.parse(19.99)).toBe(1999);
    expect(schema.parse(0)).toBe(0);
  });

  it('verliert keinen Cent bei Fliesskomma-Fallstricken', () => {
    // 19.99 * 100 ergibt in IEEE-754 1998.9999999999998.
    expect(schema.parse(19.99)).toBe(1999);
    expect(schema.parse('19,99')).toBe(1999);
  });

  it('behandelt einen Trenner mit drei Ziffern als Tausendertrenner', () => {
    expect(schema.parse('1.234')).toBe(123400);
  });

  it('ignoriert Waehrungszeichen', () => {
    expect(schema.parse('€ 9,99')).toBe(999);
    expect(schema.parse('9,99 EUR')).toBe(999);
  });

  it('erkennt negative Betraege', () => {
    expect(schema.parse('-3,40')).toBe(-340);
  });

  it('lehnt Unsinn mit einer verstaendlichen Meldung ab', () => {
    const ergebnis = schema.safeParse('abc');
    expect(ergebnis.success).toBe(false);
    if (!ergebnis.success) {
      expect(ergebnis.error.issues[0]?.message).toContain('Betrag');
    }
  });
});

describe('prozentSchema – Eingabe zu Dezimalsatz', () => {
  const schema = prozentSchema('Satz');

  it('rechnet Prozentangaben in Dezimalsaetze um', () => {
    expect(schema.parse('6,5')).toBeCloseTo(0.065, 10);
    expect(schema.parse('19')).toBeCloseTo(0.19, 10);
    expect(schema.parse('4,7')).toBeCloseTo(0.047, 10);
    expect(schema.parse(0)).toBe(0);
  });

  it('nimmt auch das Prozentzeichen entgegen', () => {
    expect(schema.parse('6,5 %')).toBeCloseTo(0.065, 10);
  });

  it('lehnt Werte ausserhalb des Bereichs ab', () => {
    expect(schema.safeParse('-1').success).toBe(false);
    expect(schema.safeParse('101').success).toBe(false);
  });

  it('lehnt Unsinn ab', () => {
    expect(schema.safeParse('abc').success).toBe(false);
  });
});

describe('pflichttext und optionalerText', () => {
  it('lehnt leere Pflichtfelder ab und nennt das Feld', () => {
    const ergebnis = pflichttext('Name').safeParse('   ');
    expect(ergebnis.success).toBe(false);
    if (!ergebnis.success) {
      expect(ergebnis.error.issues[0]?.message).toContain('Name');
    }
  });

  it('entfernt umgebende Leerzeichen', () => {
    expect(pflichttext('Name').parse('  Vase  ')).toBe('Vase');
  });

  it('macht aus leerem Freitext null', () => {
    expect(optionalerText().parse('')).toBeNull();
    expect(optionalerText().parse('  ')).toBeNull();
    expect(optionalerText().parse('Notiz')).toBe('Notiz');
  });
});

describe('skuSchema', () => {
  it('nimmt zulaessige Artikelnummern', () => {
    expect(skuSchema.parse('VASE-001')).toBe('VASE-001');
    expect(skuSchema.parse('kiss_50.a')).toBe('kiss_50.a');
  });

  it('lehnt Leerzeichen und Sonderzeichen ab', () => {
    // Die SKU landet in Exporten und moeglicherweise in Dateinamen.
    expect(skuSchema.safeParse('HAT SPACE').success).toBe(false);
    expect(skuSchema.safeParse('A/B').success).toBe(false);
    expect(skuSchema.safeParse('').success).toBe(false);
  });
});

describe('kostenpositionAnlegenSchema – Art bestimmt die Bedeutung des Werts', () => {
  it('liest den Wert bei "fix" als Cent-Betrag', () => {
    const e = kostenpositionAnlegenSchema.parse({
      bezeichnung: 'Verpackung',
      art: 'fix',
      wert: '0,85',
    });
    expect(e.wert).toBe(85);
  });

  it('liest den Wert bei "prozent" als Dezimalsatz', () => {
    const e = kostenpositionAnlegenSchema.parse({
      bezeichnung: 'Zoll',
      art: 'prozent',
      wert: '4,7',
    });
    expect(e.wert).toBeCloseTo(0.047, 10);
  });

  it('haelt Betrag und Satz auseinander', () => {
    // Derselbe Eingabetext ergibt je nach Art voellig unterschiedliche Werte.
    const alsBetrag = kostenpositionAnlegenSchema.parse({
      bezeichnung: 'X',
      art: 'fix',
      wert: '2,5',
    });
    const alsSatz = kostenpositionAnlegenSchema.parse({
      bezeichnung: 'X',
      art: 'prozent',
      wert: '2,5',
    });
    expect(alsBetrag.wert).toBe(250);
    expect(alsSatz.wert).toBeCloseTo(0.025, 10);
  });

  it('setzt die Verteilmethode standardmaessig auf Warenwert (Regel 7)', () => {
    const e = kostenpositionAnlegenSchema.parse({
      bezeichnung: 'Fracht',
      art: 'fix',
      wert: '10,00',
    });
    expect(e.verteilmethode).toBe('wert');
  });

  it('merkt sich die Vorsteuerabzugsfaehigkeit (Regel 3)', () => {
    const eust = kostenpositionAnlegenSchema.parse({
      bezeichnung: 'Einfuhrumsatzsteuer',
      art: 'prozent',
      wert: '19',
      vorsteuerabzugsfaehig: true,
    });
    const zoll = kostenpositionAnlegenSchema.parse({
      bezeichnung: 'Zoll',
      art: 'prozent',
      wert: '4,7',
    });
    expect(eust.vorsteuerabzugsfaehig).toBe(true);
    expect(zoll.vorsteuerabzugsfaehig).toBe(false);
  });
});

describe('Aendern-Schemas setzen keine Standardwerte', () => {
  /*
   * Der Fall, der beinahe Daten gekostet haette: ein PATCH mit nur einem
   * Feld darf die uebrigen nicht auf ihre Standardwerte zuruecksetzen.
   * Weder `.optional()` noch `.partial()` entfernen ein `.default()`, das
   * innerhalb eines Bausteins steckt – deshalb wird hier ausdruecklich
   * geprueft, dass nichts hinzukommt, was nicht uebergeben wurde.
   */

  it('Kanal: leerer Rumpf ergibt keine Felder', () => {
    expect(kanalAendernSchema.parse({})).toEqual({});
  });

  it('Kanal: nur der Name laesst die Gebuehren unberuehrt', () => {
    const e = kanalAendernSchema.parse({ name: 'Etsy' });
    expect(e).toEqual({ name: 'Etsy' });
    expect(e.gebuehrProzent).toBeUndefined();
    expect(e.gebuehrFix).toBeUndefined();
    expect(e.aktiv).toBeUndefined();
  });

  it('Kanal: aktiv=false bleibt false', () => {
    expect(kanalAendernSchema.parse({ aktiv: false })).toEqual({ aktiv: false });
  });

  it('Kostenposition: nur die Art laesst die uebrigen Felder unberuehrt', () => {
    const e = kostenpositionAendernSchema.parse({ art: 'fix' });
    expect(e).toEqual({ art: 'fix' });
    expect(e.aktiv).toBeUndefined();
    expect(e.vorsteuerabzugsfaehig).toBeUndefined();
  });

  it('Kostenposition: eine deaktivierte Position bleibt deaktiviert', () => {
    // Sonst wuerde jede Bearbeitung sie stillschweigend wieder einschalten.
    const e = kostenpositionAendernSchema.parse({
      art: 'prozent',
      bezeichnung: 'Zoll',
    });
    expect(e.aktiv).toBeUndefined();
  });

  it('Anlege-Schemas behalten ihre Standardwerte', () => {
    const k = kanalAnlegenSchema.parse({ name: 'Neu' });
    expect(k.gebuehrProzent).toBe(0);
    expect(k.gebuehrFix).toBe(0);
    expect(k.aktiv).toBe(true);
    expect(k.preisregel).toBe('gleiche_marge');
  });
});

describe('kanalAnlegenSchema', () => {
  it('trennt prozentuale und fixe Gebuehr', () => {
    const e = kanalAnlegenSchema.parse({
      name: 'Etsy',
      gebuehrProzent: '6,5',
      gebuehrFix: '0,20',
    });
    expect(e.gebuehrProzent).toBeCloseTo(0.065, 10);
    expect(e.gebuehrFix).toBe(20);
  });

  it('setzt vernuenftige Standardwerte', () => {
    const e = kanalAnlegenSchema.parse({ name: 'Ladenverkauf' });
    expect(e.gebuehrProzent).toBe(0);
    expect(e.gebuehrFix).toBe(0);
    expect(e.preisregel).toBe('gleiche_marge');
    expect(e.aktiv).toBe(true);
  });
});

describe('produktAnlegenSchema', () => {
  it('nimmt ein Produkt ohne Varianten entgegen', () => {
    const e = produktAnlegenSchema.parse({ name: 'Vase', sku: 'VASE-1' });
    expect(e.varianten).toBeUndefined();
    expect(e.sku).toBe('VASE-1');
  });

  it('nimmt ein Produkt mit mehreren Varianten entgegen', () => {
    const e = produktAnlegenSchema.parse({
      name: 'Kissen',
      varianten: [
        { sku: 'K-50', bezeichnung: '50x50', basispreisNetto: '24,90' },
        { sku: 'K-60', bezeichnung: '60x60' },
      ],
    });
    expect(e.varianten).toHaveLength(2);
    expect(e.varianten?.[0]?.basispreisNetto).toBe(2490);
    expect(e.varianten?.[1]?.ustSatz).toBeCloseTo(0.19, 10);
  });
});

describe('Umrechnung an der Datenbankgrenze', () => {
  it('faehrt Cent verlustfrei hin und zurueck', () => {
    for (const cent of [0, 1, 85, 2490, 123456, -340, 999999]) {
      expect(numericZuCent(centZuNumeric(cent))).toBe(cent);
    }
  });

  it('faehrt Dezimalsaetze verlustfrei hin und zurueck', () => {
    for (const satz of [0, 0.19, 0.065, 0.047, 0.0025]) {
      expect(numericZuSatz(satzZuNumeric(satz))).toBeCloseTo(satz, 10);
    }
  });

  it('schreibt vier Nachkommastellen, wie es die Spalte verlangt', () => {
    expect(centZuNumeric(85)).toBe('0.8500');
    expect(centZuNumeric(2490)).toBe('24.9000');
    expect(satzZuNumeric(0.065)).toBe('0.0650');
  });

  it('behandelt null durchgehend als null', () => {
    expect(centZuNumeric(null)).toBeNull();
    expect(centZuNumeric(undefined)).toBeNull();
    expect(numericZuCent(null)).toBeNull();
    expect(satzZuNumeric(null)).toBeNull();
    expect(numericZuSatz(null)).toBeNull();
  });

  it('liest den rohen Spaltenwert richtig', () => {
    // So kommen die Werte tatsaechlich aus Postgres zurueck.
    expect(numericZuCent('0.8500')).toBe(85);
    expect(numericZuCent('24.9000')).toBe(2490);
    expect(numericZuSatz('0.0470')).toBeCloseTo(0.047, 10);
  });
});
