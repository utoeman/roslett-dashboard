export default defineNuxtConfig({
  compatibilityDate: '2026-08-29',

  // Reine Single-Page-Anwendung: es handelt sich um ein internes Werkzeug
  // hinter einem Login, Suchmaschinen und Erstladezeit spielen keine Rolle.
  ssr: false,

  modules: ['@nuxt/ui'],

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
    sessionSecret: process.env.SESSION_SECRET ?? '',
    public: {},
  },

  devServer: {
    port: Number(process.env.PORT ?? 3000),
  },

  future: {
    compatibilityVersion: 4,
  },
});
