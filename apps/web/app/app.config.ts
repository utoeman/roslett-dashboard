/** Maps the color scales from assets/css/main.css to Nuxt UI roles. */
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'ros',
      warning: 'roswarning',
      error: 'roserror',
      success: 'rossuccess',
      info: 'rosinfo',
      neutral: 'leinen',
    },
  },

  /** Raw brand values, independent of Nuxt UI. */
  ros: {
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
      // Tabular figures keep amounts aligned.
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
