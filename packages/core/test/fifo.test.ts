import { describe, expect, it } from 'vitest';
import {
  FifoFehler,
  bestandswert,
  bucheZurueck,
  durchschnittlicherEinstand,
  ordneAbgangZu,
  sortiereFifo,
  verfuegbareMenge,
} from '../src/fifo.js';
import type { Charge } from '../src/types.js';

const charge = (
  id: string,
  datum: string,
  mengeEingang: number,
  mengeRest: number,
  einstandspreisEur: number,
): Charge => ({
  id,
  varianteId: 'v1',
  wareneingangAm: new Date(datum),
  mengeEingang,
  mengeRest,
  einstandspreisEur,
});

// Drei Chargen derselben Variante zu steigenden Einstandspreisen.
const dreiChargen = (): Charge[] => [
  charge('c1', '2026-01-10', 10, 10, 1200), // 12,00 EUR
  charge('c2', '2026-02-15', 20, 20, 1350), // 13,50 EUR
  charge('c3', '2026-03-20', 30, 30, 1500), // 15,00 EUR
];

describe('sortiereFifo', () => {
  it('sortiert nach Wareneingang, aeltester zuerst', () => {
    const unsortiert = [
      charge('c3', '2026-03-20', 1, 1, 100),
      charge('c1', '2026-01-10', 1, 1, 100),
      charge('c2', '2026-02-15', 1, 1, 100),
    ];
    expect(sortiereFifo(unsortiert).map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('entscheidet bei gleichem Datum stabil ueber die id', () => {
    const gleich = [
      charge('b', '2026-01-10', 1, 1, 100),
      charge('a', '2026-01-10', 1, 1, 100),
      charge('c', '2026-01-10', 1, 1, 100),
    ];
    expect(sortiereFifo(gleich).map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('veraendert die Eingangsliste nicht', () => {
    const original = dreiChargen().reverse();
    const kopie = [...original];
    sortiereFifo(original);
    expect(original).toEqual(kopie);
  });
});

describe('ordneAbgangZu – Abgang ueber drei Chargen mit Rest (Regel 9)', () => {
  it('verbraucht die aelteste Charge zuerst und verteilt ueber drei Chargen', () => {
    const chargen = dreiChargen(); // 10 + 20 + 30 = 60 Stueck
    const e = ordneAbgangZu(chargen, 45);

    expect(e.zuordnungen).toEqual([
      { chargeId: 'c1', menge: 10, einstandspreisEur: 1200 },
      { chargeId: 'c2', menge: 20, einstandspreisEur: 1350 },
      { chargeId: 'c3', menge: 15, einstandspreisEur: 1500 },
    ]);
    expect(e.ungedeckteMenge).toBe(0);

    // 10*12,00 + 20*13,50 + 15*15,00 = 120 + 270 + 225 = 615,00 EUR
    expect(e.wareneinsatzEur).toBe(61500);

    // Die dritte Charge behaelt einen Rest von 15 Stueck.
    expect(e.chargenNachher.map((c) => [c.id, c.mengeRest])).toEqual([
      ['c1', 0],
      ['c2', 0],
      ['c3', 15],
    ]);
    expect(verfuegbareMenge(e.chargenNachher)).toBe(15);
  });

  it('veraendert die uebergebenen Chargen nicht', () => {
    const chargen = dreiChargen();
    const vorher = chargen.map((c) => c.mengeRest);
    ordneAbgangZu(chargen, 45);
    expect(chargen.map((c) => c.mengeRest)).toEqual(vorher);
  });

  it('bleibt innerhalb einer Charge, wenn sie ausreicht', () => {
    const e = ordneAbgangZu(dreiChargen(), 4);
    expect(e.zuordnungen).toEqual([
      { chargeId: 'c1', menge: 4, einstandspreisEur: 1200 },
    ]);
    expect(e.wareneinsatzEur).toBe(4800);
  });

  it('ueberspringt leere Chargen', () => {
    const chargen = [
      charge('leer', '2026-01-01', 5, 0, 1000),
      charge('voll', '2026-02-01', 5, 5, 2000),
    ];
    const e = ordneAbgangZu(chargen, 3);
    expect(e.zuordnungen.map((z) => z.chargeId)).toEqual(['voll']);
    expect(e.chargenNachher.find((c) => c.id === 'leer')!.mengeRest).toBe(0);
  });

  it('weist Fehlmengen aus, statt zu werfen', () => {
    // Ob ein Abgang ins Minus laufen darf, entscheidet die Fachlogik darueber,
    // nicht die Engine.
    const e = ordneAbgangZu(dreiChargen(), 100);
    expect(e.ungedeckteMenge).toBe(40);
    expect(verfuegbareMenge(e.chargenNachher)).toBe(0);
    expect(e.wareneinsatzEur).toBe(10 * 1200 + 20 * 1350 + 30 * 1500);
  });

  it('meldet die volle Menge als ungedeckt, wenn nichts vorhanden ist', () => {
    const e = ordneAbgangZu([], 5);
    expect(e.zuordnungen).toEqual([]);
    expect(e.ungedeckteMenge).toBe(5);
    expect(e.wareneinsatzEur).toBe(0);
  });

  it('haelt bei erschoepftem Bedarf spaetere Chargen unberuehrt', () => {
    // Deckt den Zweig ab, in dem die Restmenge bereits null ist,
    // die Schleife aber noch weitere Chargen durchlaeuft.
    const e = ordneAbgangZu(dreiChargen(), 5);
    expect(e.chargenNachher.map((c) => c.mengeRest)).toEqual([5, 20, 30]);
  });

  it('lehnt ungueltige Abgangsmengen ab', () => {
    expect(() => ordneAbgangZu(dreiChargen(), 0)).toThrow(FifoFehler);
    expect(() => ordneAbgangZu(dreiChargen(), -1)).toThrow(FifoFehler);
    expect(() => ordneAbgangZu(dreiChargen(), 1.5)).toThrow(FifoFehler);
  });
});

describe('bucheZurueck – Retoure und Storno', () => {
  it('bucht in genau die Chargen zurueck, aus denen die Ware kam', () => {
    const chargen = dreiChargen();
    const abgang = ordneAbgangZu(chargen, 45);
    const zurueck = bucheZurueck(abgang.chargenNachher, abgang.zuordnungen);

    // Nach vollstaendigem Storno steht der Ausgangszustand wieder da.
    expect(zurueck.map((c) => [c.id, c.mengeRest])).toEqual([
      ['c1', 10],
      ['c2', 20],
      ['c3', 30],
    ]);
  });

  it('bucht eine Teilretoure in die richtige Charge', () => {
    const chargen = dreiChargen();
    const abgang = ordneAbgangZu(chargen, 45);
    // Nur 5 Stueck aus der teuersten Charge kommen zurueck.
    const zurueck = bucheZurueck(abgang.chargenNachher, [
      { chargeId: 'c3', menge: 5, einstandspreisEur: 1500 },
    ]);
    expect(zurueck.find((c) => c.id === 'c3')!.mengeRest).toBe(20);
    expect(zurueck.find((c) => c.id === 'c1')!.mengeRest).toBe(0);
  });

  it('lehnt eine Rueckbuchung ueber die Eingangsmenge hinaus ab', () => {
    const chargen = dreiChargen();
    expect(() =>
      bucheZurueck(chargen, [
        { chargeId: 'c1', menge: 1, einstandspreisEur: 1200 },
      ]),
    ).toThrow(/ueberschreitet die Eingangsmenge/);
  });

  it('lehnt unbekannte Chargen ab', () => {
    expect(() =>
      bucheZurueck(dreiChargen(), [
        { chargeId: 'gibtsnicht', menge: 1, einstandspreisEur: 100 },
      ]),
    ).toThrow(/nicht bekannt/);
  });

  it('lehnt ungueltige Mengen ab', () => {
    expect(() =>
      bucheZurueck(dreiChargen(), [
        { chargeId: 'c1', menge: 0, einstandspreisEur: 100 },
      ]),
    ).toThrow(FifoFehler);
    expect(() =>
      bucheZurueck(dreiChargen(), [
        { chargeId: 'c1', menge: 1.5, einstandspreisEur: 100 },
      ]),
    ).toThrow(FifoFehler);
  });
});

describe('bestandswert und durchschnittlicherEinstand', () => {
  it('bewertet den Restbestand zu Einstandspreisen', () => {
    // 10*12,00 + 20*13,50 + 30*15,00 = 120 + 270 + 450 = 840,00 EUR
    expect(bestandswert(dreiChargen())).toBe(84000);
    expect(bestandswert([])).toBe(0);
  });

  it('bildet den gewichteten Durchschnitt', () => {
    // 840,00 EUR auf 60 Stueck = 14,00 EUR
    expect(durchschnittlicherEinstand(dreiChargen())).toBe(1400);
  });

  it('gibt ohne Restbestand null zurueck', () => {
    expect(durchschnittlicherEinstand([])).toBe(0);
    expect(
      durchschnittlicherEinstand([charge('c', '2026-01-01', 5, 0, 1000)]),
    ).toBe(0);
  });
});
