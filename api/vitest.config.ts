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
      // Catraca: o piso medido em 2026-08-31. Sobe conforme os setores fecham;
      // nunca desce. O CI dizia "≥ 95%" sem nenhum limite configurado.
      thresholds: {
        statements: 48,
        branches: 41,
        functions: 53,
        lines: 50,
      },
    },
  },
});
