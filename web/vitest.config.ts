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
      // Catraca: o piso medido em 2026-08-31. Sobe conforme os setores fecham.
      thresholds: {
        statements: 65,
        branches: 60,
        functions: 63,
        lines: 66,
      },
    },
  },
});
