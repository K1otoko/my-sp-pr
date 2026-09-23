import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import hooks from 'eslint-plugin-react-hooks';
import refresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    'frontend/*/src/api/generated/**',
    '.api-codegen-tmp/**',
    '.verification/**',
  ]),
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  },
  {
    files: ['ecosystem.config.cjs'],
    extends: [js.configs.recommended],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    files: ['backend/**/*.ts', 'scripts/**/*.{ts,mjs}', '*.mjs', 'frontend/*/vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['frontend/*/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    extends: [hooks.configs.flat.recommended, refresh.configs.vite],
  },
]);
