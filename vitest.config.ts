import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    include: [
      'packages/**/*.test.ts',
      'apps/**/*.test.ts',
      'scripts/**/*.test.ts',
      'fixtures/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**/*.ts'],
      exclude: ['packages/core/src/**/*.test.ts', 'packages/core/src/gen/**'],
      thresholds: {
        lines: 90,
        branches: 85,
      },
    },
  },
});
