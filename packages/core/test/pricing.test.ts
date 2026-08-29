import { describe, expect, it } from 'vitest';
import {
  PreisFehler,
  berechneKanalpreis,
  berechneMarge,
  berechneSelbstkosten,
  berechneVerkaufspreis,
  mindestmarge,
  positionenFuerVariante,
} from '../src/pricing.js';
import { GeldFehler } from '../src/money.js';
import type { Kanal, Kostenposition } from '../src/types.js';

const kp = (
  bezeichnung: string,
  art: 'fix' | 'prozent',
  wert: number,
  optionen: Partial<Kostenposition> = {},
): Kostenposition => ({
  id: bezeichnung,
  varianteId: null,
  bezeichnung,
  art,
  wert,
  vorsteuerabzugsfaehig: false,
  aktiv: true,
  verteilmethode: 'wert',
  ...optionen,
});

const kanal = (over: Partial<Kanal> = {}): Kanal => ({
  id: 'k1',
  name: 'Etsy',
  gebuehrProzent: 0.065,
  gebuehrFix: 20,
  preisregel: 'gleiche_marge',
  aktiv: true,
  ...over,
});

describe('positionenFuerVariante', () => {
  it('nimmt globale und variantenspezifische aktive Positionen', () => {
    const alle = [
      kp('global', 'fix', 100),
      kp('eigene', 'fix', 200, { varianteId: 'v1' }),
      kp('fremde', 'fix', 300, { varianteId: 'v2' }),
      kp('inaktiv', 'fix', 400, { aktiv: false }),
    ];
    expect(positionenFuerVariante(alle, 'v1').map((p) => p.bezeichnung)).toEqual([
      'global',
      'eigene',
    ]);
  });
});

describe('berechneSelbstkosten – gemischte Fix- und Prozentkosten', () => {
  it('summiert Fixbetraege und Prozentanteile auf den Einstandspreis', () => {
    // Einstandspreis 20,00 EUR
    const e = berechneSelbstkosten(2000, [
      kp('Verpackung', 'fix', 85), //        0,85 EUR
      kp('Handling', 'prozent', 0.05), //    5 % von 20,00 = 1,00 EUR
      kp('Lagerkosten', 'fix', 40), //       0,40 EUR
      kp('Ausschussquote', 'prozent', 0.02), // 2 % von 20,00 = 0,40 EUR
    ]);

    expect(e.einstandspreisEur).toBe(2000);
    expect(e.zeilen.map((z) => z.betragEur)).toEqual([85, 100, 40, 40]);
    // 20,00 + 0,85 + 1,00 + 0,40 + 0,40 = 22,65 EUR
    expect(e.selbstkostenEur).toBe(2265);
    expect(e.vorsteuerEur).toBe(0);
  });

  it('rundet erst am Ende, nicht je Position (Regel 10)', () => {
    // 3 x 3,333 % von 10,01 EUR ergibt je 0,3336... Cent.
    // Zwischenrunden wuerde jeweils 33 ergeben, Summe 1100.
    // Korrekt ist die Summe der ungerundeten Anteile: 1001 + 100,0800... = 1101.
    const e = berechneSelbstkosten(1001, [
      kp('a', 'prozent', 0.03333),
      kp('b', 'prozent', 0.03333),
      kp('c', 'prozent', 0.03333),
    ]);
    expect(e.selbstkostenEur).toBe(1101);
  });

  it('ueberspringt inaktive Positionen', () => {
    const e = berechneSelbstkosten(1000, [
      kp('aktiv', 'fix', 100),
      kp('inaktiv', 'fix', 500, { aktiv: false }),
    ]);
    expect(e.selbstkostenEur).toBe(1100);
    expect(e.zeilen).toHaveLength(1);
  });

  it('kommt ohne Positionen aus', () => {
    const e = berechneSelbstkosten(1000, []);
    expect(e.selbstkostenEur).toBe(1000);
    expect(e.zeilen).toEqual([]);
  });

  it('lehnt ungueltige Einstandspreise und Fixbetraege ab', () => {
    expect(() => berechneSelbstkosten(10.5, [])).toThrow(GeldFehler);
    expect(() => berechneSelbstkosten(1000, [kp('krumm', 'fix', 1.5)])).toThrow(
      /krumm/,
    );
  });
});

describe('berechneSelbstkosten – vorsteuerabzugsfaehige Position (Regel 3)', () => {
  it('haelt Einfuhrumsatzsteuer aus den Selbstkosten heraus, Zoll aber nicht', () => {
    // Einstandspreis 100,00 EUR.
    // Zoll 4,7 % ist nicht abzugsfaehig und belastet die Marge.
    // Einfuhrumsatzsteuer 19 % ist Vorsteuer und belastet sie nicht.
    const e = berechneSelbstkosten(10000, [
      kp('Zoll', 'prozent', 0.047),
      kp('Einfuhrumsatzsteuer', 'prozent', 0.19, {
        vorsteuerabzugsfaehig: true,
      }),
    ]);

    // 100,00 + 4,70 = 104,70 EUR – die 19,00 EUR EUSt bleiben draussen.
    expect(e.selbstkostenEur).toBe(10470);
    expect(e.vorsteuerEur).toBe(1900);

    // Beide Zeilen werden ausgewiesen, aber unterschiedlich markiert.
    expect(e.zeilen).toEqual([
      { bezeichnung: 'Zoll', betragEur: 470, ausgenommen: false },
      { bezeichnung: 'Einfuhrumsatzsteuer', betragEur: 1900, ausgenommen: true },
    ]);
  });

  it('behandelt auch fixe Positionen als abzugsfaehig, wenn markiert', () => {
    const e = berechneSelbstkosten(5000, [
      kp('EUSt fix', 'fix', 950, { vorsteuerabzugsfaehig: true }),
      kp('Zollabfertigung', 'fix', 1500),
    ]);
    expect(e.selbstkostenEur).toBe(6500);
    expect(e.vorsteuerEur).toBe(950);
  });
});

describe('berechneMarge – Marge und Aufschlag sind nicht dasselbe (Regel 4)', () => {
  it('unterscheidet die beiden Kennzahlen sauber', () => {
    // 40,00 EUR Selbstkosten, 100,00 EUR Verkaufspreis.
    const e = berechneMarge(10000, 4000);
    expect(e.deckungsbeitragEur).toBe(6000);
    expect(e.marge).toBeCloseTo(0.6, 10); // 60 % vom Verkaufspreis
    expect(e.aufschlag).toBeCloseTo(1.5, 10); // 150 % auf die Selbstkosten
    expect(e.marge).not.toBeCloseTo(e.aufschlag, 5);
  });

  it('erkennt ein Verlustgeschaeft an negativen Kennzahlen', () => {
    const e = berechneMarge(5000, 8000);
    expect(e.deckungsbeitragEur).toBe(-3000);
    expect(e.marge).toBeCloseTo(-0.6, 10);
    expect(e.aufschlag).toBeCloseTo(-0.375, 10);
  });

  it('gibt bei Verkaufspreis oder Selbstkosten von null jeweils null zurueck', () => {
    expect(berechneMarge(0, 1000).marge).toBe(0);
    expect(berechneMarge(1000, 0).aufschlag).toBe(0);
    expect(berechneMarge(1000, 0).marge).toBeCloseTo(1, 10);
  });

  it('lehnt Nicht-Cent-Werte ab', () => {
    expect(() => berechneMarge(1.5, 100)).toThrow(GeldFehler);
    expect(() => berechneMarge(100, 1.5)).toThrow(GeldFehler);
  });
});

describe('berechneVerkaufspreis – Rueckwaertsrechnung (Regel 5)', () => {
  it('rechnet ohne Gebuehren aus der Zielmarge zurueck', () => {
    // 40,00 EUR Selbstkosten bei 60 % Zielmarge: 40 / 0,4 = 100,00 EUR.
    const vk = berechneVerkaufspreis({ selbstkostenEur: 4000, zielmarge: 0.6 });
    expect(vk).toBe(10000);
    expect(berechneMarge(vk, 4000).marge).toBeCloseTo(0.6, 10);
  });

  it('bezieht prozentuale Gebuehren auf den gesuchten Verkaufspreis', () => {
    // VK = (40,00 + 0,20) / (1 - 0,40 - 0,065) = 40,20 / 0,535 = 75,14 EUR
    const vk = berechneVerkaufspreis({
      selbstkostenEur: 4000,
      zielmarge: 0.4,
      gebuehrProzent: 0.065,
      gebuehrFixEur: 20,
    });
    expect(vk).toBe(7514);

    // Gegenprobe: nach Abzug der Gebuehren steht die Zielmarge.
    const gebuehren = Math.round(vk * 0.065 + 20);
    const db = vk - 4000 - gebuehren;
    expect(db / vk).toBeCloseTo(0.4, 3);
  });

  it('liegt hoeher als der naive Aufschlag der Gebuehr auf die Selbstkosten', () => {
    const richtig = berechneVerkaufspreis({
      selbstkostenEur: 4000,
      zielmarge: 0.4,
      gebuehrProzent: 0.2,
    });
    const naiv = Math.round((4000 * 1.2) / (1 - 0.4));
    expect(richtig).toBeGreaterThan(naiv);
  });

  it('erlaubt eine Zielmarge von null', () => {
    expect(berechneVerkaufspreis({ selbstkostenEur: 4000, zielmarge: 0 })).toBe(
      4000,
    );
  });

  it('erlaubt eine negative Zielmarge als bewussten Verlustverkauf', () => {
    // Abverkauf unter Selbstkosten: der Nenner bleibt positiv.
    expect(
      berechneVerkaufspreis({ selbstkostenEur: 4000, zielmarge: -0.25 }),
    ).toBe(3200);
  });

  it('wirft bei rechnerisch unmoeglicher Zielmarge', () => {
    // 70 % Marge plus 35 % Gebuehren ergeben 105 % – der Nenner wird negativ.
    expect(() =>
      berechneVerkaufspreis({
        selbstkostenEur: 4000,
        zielmarge: 0.7,
        gebuehrProzent: 0.35,
      }),
    ).toThrow(PreisFehler);

    // Der Fehler muss erklaeren, woran es liegt, nicht nur dass es scheitert.
    expect(() =>
      berechneVerkaufspreis({
        selbstkostenEur: 4000,
        zielmarge: 0.7,
        gebuehrProzent: 0.35,
      }),
    ).toThrow(/105,0\s%.*nichts\s+fuer die Selbstkosten uebrig/s);
  });

  it('wirft, wenn Marge und Gebuehren exakt 100 Prozent ergeben', () => {
    expect(() =>
      berechneVerkaufspreis({
        selbstkostenEur: 4000,
        zielmarge: 0.9,
        gebuehrProzent: 0.1,
      }),
    ).toThrow(PreisFehler);
  });

  it('wirft bei einer Zielmarge von 100 Prozent oder mehr', () => {
    expect(() =>
      berechneVerkaufspreis({ selbstkostenEur: 4000, zielmarge: 1 }),
    ).toThrow(/unter 100 %/);
    expect(() =>
      berechneVerkaufspreis({ selbstkostenEur: 4000, zielmarge: 1.5 }),
    ).toThrow(/unter 100 %/);
  });

  it('lehnt ungueltige Parameter ab', () => {
    expect(() =>
      berechneVerkaufspreis({ selbstkostenEur: 4000, zielmarge: Number.NaN }),
    ).toThrow(PreisFehler);
    expect(() =>
      berechneVerkaufspreis({
        selbstkostenEur: 4000,
        zielmarge: 0.3,
        gebuehrProzent: -0.1,
      }),
    ).toThrow(PreisFehler);
    expect(() =>
      berechneVerkaufspreis({ selbstkostenEur: 1.5, zielmarge: 0.3 }),
    ).toThrow(GeldFehler);
    expect(() =>
      berechneVerkaufspreis({
        selbstkostenEur: 4000,
        zielmarge: 0.3,
        gebuehrFixEur: 1.5,
      }),
    ).toThrow(GeldFehler);
  });
});

describe('berechneKanalpreis', () => {
  it('rechnet bei gleicher Marge den Preis zurueck', () => {
    const e = berechneKanalpreis({
      kanal: kanal(),
      selbstkostenEur: 4000,
      zielmarge: 0.4,
    });
    expect(e.verkaufspreisNettoEur).toBe(7514);
    expect(e.gebuehrenEur).toBe(Math.round(7514 * 0.065) + 20);
    expect(e.marge).toBeCloseTo(0.4, 3);
    expect(e.kanalName).toBe('Etsy');
  });

  it('nimmt bei fester Preisregel den vorgegebenen Preis', () => {
    const e = berechneKanalpreis({
      kanal: kanal({ preisregel: 'fest', name: 'Ladenverkauf' }),
      selbstkostenEur: 4000,
      zielmarge: 0.4,
      festpreisEur: 6000,
    });
    expect(e.verkaufspreisNettoEur).toBe(6000);
    // 6,5 % von 60,00 = 3,90 EUR, plus 0,20 EUR fix.
    expect(e.gebuehrenEur).toBe(410);
    expect(e.deckungsbeitragEur).toBe(6000 - 4000 - 410);
    // Die tatsaechliche Marge liegt unter der Zielmarge – genau das soll sichtbar sein.
    expect(e.marge).toBeLessThan(0.4);
  });

  it('weist Marge und Aufschlag getrennt aus', () => {
    const e = berechneKanalpreis({
      kanal: kanal({ gebuehrProzent: 0, gebuehrFix: 0, preisregel: 'fest' }),
      selbstkostenEur: 4000,
      zielmarge: 0,
      festpreisEur: 10000,
    });
    expect(e.marge).toBeCloseTo(0.6, 10);
    expect(e.aufschlag).toBeCloseTo(1.5, 10);
  });

  it('wirft, wenn bei fester Preisregel der Preis fehlt', () => {
    expect(() =>
      berechneKanalpreis({
        kanal: kanal({ preisregel: 'fest' }),
        selbstkostenEur: 4000,
        zielmarge: 0.4,
      }),
    ).toThrow(/kein Festpreis/);
  });

  it('gibt bei einem Festpreis von null neutrale Kennzahlen zurueck', () => {
    const e = berechneKanalpreis({
      kanal: kanal({ preisregel: 'fest' }),
      selbstkostenEur: 0,
      zielmarge: 0,
      festpreisEur: 0,
    });
    expect(e.marge).toBe(0);
    expect(e.aufschlag).toBe(0);
  });

  it('lehnt ungueltige Selbstkosten und Festpreise ab', () => {
    expect(() =>
      berechneKanalpreis({ kanal: kanal(), selbstkostenEur: 1.5, zielmarge: 0.3 }),
    ).toThrow(GeldFehler);
    expect(() =>
      berechneKanalpreis({
        kanal: kanal({ preisregel: 'fest' }),
        selbstkostenEur: 1000,
        zielmarge: 0.3,
        festpreisEur: 1.5,
      }),
    ).toThrow(GeldFehler);
  });
});

describe('mindestmarge', () => {
  it('zeigt, was bei gegebenem Preis uebrig bleibt', () => {
    const m = mindestmarge(4000, { gebuehrProzent: 0.065, gebuehrFix: 20 }, 10000);
    // (100,00 - 40,00 - 6,50 - 0,20) / 100,00
    expect(m).toBeCloseTo(0.533, 3);
  });

  it('wird negativ, wenn der Preis nicht kostendeckend ist', () => {
    expect(
      mindestmarge(10000, { gebuehrProzent: 0.1, gebuehrFix: 0 }, 5000),
    ).toBeLessThan(0);
  });

  it('gibt bei Verkaufspreis null null zurueck', () => {
    expect(mindestmarge(1000, { gebuehrProzent: 0.1, gebuehrFix: 0 }, 0)).toBe(0);
  });

  it('lehnt Nicht-Cent-Werte ab', () => {
    expect(() =>
      mindestmarge(1.5, { gebuehrProzent: 0, gebuehrFix: 0 }, 1000),
    ).toThrow(GeldFehler);
  });
});
