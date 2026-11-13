export default defineNuxtConfig({
  compatibilityDate: '2026-08-29',

  // Internal tool behind a login: SEO and first paint do not matter.
  ssr: false,

  modules: ['@nuxt/ui', 'nuxt-auth-utils'],

  // The design is light-only; without the color mode module it stays light.
  ui: {
    colorMode: false,
  },

  // Subfolders only group components; keep them out of the component names.
  components: [{ path: '~/components', pathPrefix: false }],

  css: ['~/assets/css/main.css'],

  typescript: {
    strict: true,
    typeCheck: false,
  },

  // All config comes from the environment. `public` is empty: the client
  // only calls the API via relative paths.
  runtimeConfig: {
    // Empty at build time so the URL never ends up in the bundle (Netlify's
    // secrets scan fails the build); the db client falls back to DATABASE_URL at runtime.
    databaseUrl: '',
    // Set at runtime via NUXT_ACCESS_PASSWORD_HASH, empty at build time for the same reason.
    // The session is sealed with a key derived from NUXT_APP_SECRET (nuxt-auth-utils 0.6).
    accessPasswordHash: '',
    // Dev Dashboard app (G3), set via NUXT_SHOPIFY_SHOP / _CLIENT_ID / _CLIENT_SECRET.
    shopify: { shop: '', clientId: '', clientSecret: '' },
    // Shared with the Netlify scheduled functions, set via NUXT_CRON_SECRET.
    cronSecret: '',
    public: {},
  },

  devServer: {
    port: Number(process.env.PORT ?? 3000),
  },

  future: {
    compatibilityVersion: 4,
  },
});
