// Eine Konfiguration fuer das ganze Repo: Web-App (Vue/Nuxt) und packages/core (reines TypeScript).
// createConfigForNuxt braucht kein erzeugtes .nuxt-Verzeichnis und laeuft deshalb auch in der CI vor dem Build.
import { createConfigForNuxt } from '@nuxt/eslint-config/flat';

export default createConfigForNuxt({
  dirs: { src: ['apps/web/app'] },
  features: {
    typescript: true,
  },
}).prepend({
  ignores: ['**/.nuxt/**', '**/.output/**', '**/dist/**', '**/coverage/**', 'apps/web/server/db/migrations/**'],
});
