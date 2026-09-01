import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'coverage', '.wrangler', 'assets']),
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      // Worker: globais de browser (fetch, crypto, Request) mais console.
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Import não usado é o achado que interessa agora: a quebra do index.ts
      // em módulos deixou dezenas para trás.
      // Dívida herdada, não entulho desta quebra: 25 ocorrências em código que
      // nunca passou por linter. Fica como aviso para o lint poder ser portão
      // desde já; cada setor tipa o que é seu ao passar por ali.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
]);
