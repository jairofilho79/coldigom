import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/__tests__/**', 'src/**/*.{test,spec}.{ts,tsx}', 'src/vitest-env.d.ts'],
      // Catraca: sobe a cada setor fechado, nunca desce.
      // S0 (2026-08-31): 65 / 60 / 63 / 66
      // S6 (2026-08-31): 67 / 62 / 64 / 69
      // S5 (2026-08-31): 68 / 63 / 64 / 70
      // P2 (2026-09-03): fila de revisão — 79.39 / 72.41 / 76.63 / 81.79
      // Gestos (2026-09-11): editor de gestos — 77.59 / 72.79 / 77.59 / 79.53 (statements e lines abaixo da catraca por dívida de develop: áudio/Drive de 2026-09-08..11)
      // Dívida paga (2026-09-14): testes de áudio/Drive — 80.51 / 75.74 / 81.44 / 82.42
      // AuthContext + PraiseDetailPage (2026-09-15): os dois abaixo de 50% de
      // linhas foram para 100% / 94.04% — 91.85 / 83.86 / 90.1 / 94.45
      thresholds: {
        // Medido: 91.85 / 83.86 / 90.1 / 94.45
        statements: 91,
        branches: 83,
        functions: 90,
        lines: 94,
      },
    },
  },
});
