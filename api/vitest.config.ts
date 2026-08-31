import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      // Antes media só o index.ts, o que escondia auth.ts (39%) e todo o
      // caminho do Drive (~2%). Medir tudo é o ponto de partida honesto.
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**'],
      // Catraca: sobe a cada setor fechado, nunca desce.
      // S0 (2026-08-31): 48 / 41 / 53 / 50
      // S1 (2026-08-31): 52 / 44 / 58 / 54
      // S2 (2026-08-31): 53 / 46 / 61 / 55
      thresholds: {
        statements: 53,
        branches: 46,
        functions: 61,
        lines: 55,
      },
    },
  },
});
