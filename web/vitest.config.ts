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
      thresholds: {
        // S8: medido 79.10 / 72.33 / 76.97 / 81.52
        statements: 79,
        branches: 72,
        functions: 76,
        lines: 81,
      },
    },
  },
});
