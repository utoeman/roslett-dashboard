/**
 * Design-Tokens.
 *
 * Die Farbskalen stehen in assets/css/main.css; hier wird festgelegt, welche
 * Skala Nuxt UI fuer welche Rolle nimmt.
 */
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'trd',
      warning: 'trdwarning',
      error: 'trderror',
      success: 'trdsuccess',
      info: 'trdinfo',
      neutral: 'leinen',
    },
  },

  /** Rohwerte der Marke, unabhaengig von Nuxt UI. */
  trd: {
    farben: {
      primary: '#4A5A34',
      grund: '#F3F0EA',
      warning: '#FBEBD0',
      error: '#F3DCD6',
      info: '#E3ECF3',
      success: '#639922',
      sand: '#C9A27A',
    },
    schrift: {
      familie: 'Instrument Sans',
      zahlenFamilie: 'IBM Plex Mono',
      // Zahlenspalten laufen mit gleich breiten Ziffern, damit Betraege
      // untereinander buendig stehen.
      zahlen: 'tabular-nums',
    },
    dichte: {
      tabellenzeileHoehe: '36px',
    },
    radius: {
      bedienelement: '8px',
      karte: '12px',
    },
    rahmen: {
      haarlinie: '0.5px',
    },
  },
});
