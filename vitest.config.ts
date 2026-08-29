import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/web/test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**/*.ts'],
      // index.ts reicht Exporte nur durch, types.ts enthaelt keinen Laufzeitcode.
      exclude: ['packages/core/src/index.ts', 'packages/core/src/types.ts'],
      thresholds: { lines: 95, functions: 100, branches: 90, statements: 95 },
    },
  },
});
