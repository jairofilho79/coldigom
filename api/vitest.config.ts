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
      // P2 (2026-09-03): fila de revisão — 70.48 / 66.16 / 72.79 / 72.88
      // Gestos (2026-09-11): editor de gestos — 74.64 / 70.97 / 76.65 / 77.09
      // Contribuições, rotas admin (2026-09-17): 77.51 / 73.16 / 79.8 / 79.97
      // Contribuições admin, fix de revisão (2026-09-17): 77.64 / 73.19 / 80.04 / 80.12
      thresholds: {
        // Fix de revisão: medido 77.64 / 73.19 / 80.04 / 80.12
        statements: 77,
        branches: 73,
        functions: 80,
        lines: 80,
      },
    },
  },
});
