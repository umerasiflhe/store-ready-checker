// eslint.config.js
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import vitest from '@vitest/eslint-plugin';
import playwright from 'eslint-plugin-playwright';
import prettier from 'eslint-config-prettier';

const offDevice =
  'Store Ready never sends data off the device (hard constraint 1). Ask the owner before adding network code.';

export default defineConfig([
  globalIgnores([
    '**/dist/**',
    '**/coverage/**',
    'packages/core/src/gen/**',
    'fixtures/files/**',
    'apps/web/src/samples.data.ts',
    'playwright-report/**',
    'test-results/**',
    '**/.build/**',
  ]),
  {
    files: ['**/*.{ts,mts,cts,js,mjs,cjs}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    // Root config files aren't in any tsconfig: lint them without types.
    files: ['*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // Shipped code: no network APIs, no console output (it could leak file contents).
    files: ['apps/web/src/**/*.ts', 'packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts'].map((name) => ({
          name,
          message: offDevice,
        })),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'navigator', property: 'sendBeacon', message: offDevice },
        ...['globalThis', 'self', 'window'].map((object) => ({
          object,
          property: 'fetch',
          message: offDevice,
        })),
      ],
      'no-console': 'error',
    },
  },
  {
    // The core runs inside a browser worker.
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'fs', 'path', 'os', 'child_process'],
              message: 'packages/core runs in a browser worker; no Node built-ins.',
            },
          ],
        },
      ],
    },
  },
  { files: ['**/*.test.ts'], extends: [vitest.configs.recommended] },
  { files: ['e2e/**/*.ts'], extends: [playwright.configs['flat/recommended']] },
  prettier,
]);
