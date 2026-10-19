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
    databaseUrl: process.env.DATABASE_URL ?? '',
    // Set at runtime via NUXT_ACCESS_PASSWORD_HASH; empty at build time so no
    // secret ends up in the bundle. NUXT_SESSION_PASSWORD is read by nuxt-auth-utils.
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
