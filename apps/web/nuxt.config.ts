export default defineNuxtConfig({
  compatibilityDate: '2026-08-29',

  // Reine Single-Page-Anwendung: es handelt sich um ein internes Werkzeug
  // hinter einem Login, Suchmaschinen und Erstladezeit spielen keine Rolle.
  ssr: false,

  modules: ['@nuxt/ui', 'nuxt-auth-utils'],

  // Das Design (Leinengrau/Oliv) ist nur hell entworfen. Ohne Farbmodus-Modul
  // bleibt die App auch bei dunklem System hell.
  ui: {
    colorMode: false,
  },

  /**
   * Komponenten liegen nach Sachgebiet in Unterordnern (artikel/, layout/,
   * kalkulator/ …). Ohne pathPrefix wuerde Nuxt den Ordnernamen voranstellen
   * und aus SeitenKopf ein LayoutSeitenKopf machen. Die Ordner gliedern hier
   * nur den Bestand, sie gehoeren nicht in den Namen.
   */
  components: [{ path: '~/components', pathPrefix: false }],

  css: ['~/assets/css/main.css'],

  typescript: {
    strict: true,
    typeCheck: false,
  },

  /**
   * Jede Konfiguration kommt aus der Umgebung. Werte ohne `public` bleiben
   * auf dem Server. `public` ist bewusst leer: der Client spricht die API
   * ausschliesslich ueber relative Pfade an und braucht deshalb keine
   * Basis-URL.
   */
  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL ?? '',
    // Hash des Zugangspassworts, zur Laufzeit aus NUXT_ACCESS_PASSWORD_HASH.
    // Leer im Build, damit kein Geheimnis im Server-Bundle landet. Das
    // Sitzungsgeheimnis liest nuxt-auth-utils selbst aus NUXT_SESSION_PASSWORD.
    accessPasswordHash: '',
    public: {},
  },

  devServer: {
    port: Number(process.env.PORT ?? 3000),
  },

  future: {
    compatibilityVersion: 4,
  },
});
