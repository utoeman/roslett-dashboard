/**
 * Design-Tokens.
 *
 * In Phase 1 nur hinterlegt, noch nicht angewendet – die Oberflaeche entsteht
 * ab Phase 2. Die Werte stehen hier und nicht in einer CSS-Datei, damit
 * Nuxt UI seine Komponentenfarben daraus ableiten kann.
 */
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'trd',
      warning: 'trdwarning',
      error: 'trderror',
      success: 'trdsuccess',
      neutral: 'zinc',
    },
  },

  /** Rohwerte der Marke, unabhaengig von Nuxt UI. */
  trd: {
    farben: {
      primary: '#B84C3E',
      warning: '#EF9F27',
      error: '#E24B4A',
      success: '#639922',
    },
    schrift: {
      familie: 'Inter',
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
