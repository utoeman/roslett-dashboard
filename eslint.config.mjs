// One config for the web app and packages/core; works without a generated .nuxt directory.
import { createConfigForNuxt } from '@nuxt/eslint-config/flat';

export default createConfigForNuxt({
  dirs: { src: ['apps/web/app'] },
  features: {
    typescript: true,
  },
}).prepend({
  ignores: ['**/.nuxt/**', '**/.output/**', '**/dist/**', '**/coverage/**', 'apps/web/server/db/migrations/**'],
});
