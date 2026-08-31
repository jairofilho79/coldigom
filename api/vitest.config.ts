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
      // S3 (2026-08-31): 55 / 48 / 63 / 57
      // S4 (2026-08-31): 58 / 51 / 65 / 59
      thresholds: {
        // S8: medido 69.42 / 64.94 / 72.09 / 71.76
        statements: 69,
        branches: 64,
        functions: 72,
        lines: 71,
      },
    },
  },
});
