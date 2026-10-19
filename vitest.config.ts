import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/web/test/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**/*.ts'],
      // index.ts only re-exports, types.ts has no runtime code.
      exclude: ['packages/core/src/index.ts', 'packages/core/src/types.ts'],
      thresholds: { lines: 95, functions: 100, branches: 90, statements: 95 },
    },
  },
});
