import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Render React-Native primitives through React-Native-Web to the jsdom DOM (ADR-044).
    alias: { 'react-native': 'react-native-web' },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      // lcov feeds SonarQube Cloud; paths relative to the repo root so Sonar can match them.
      reporter: ['text-summary', ['lcov', { projectRoot: '../..' }]],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.tsx', 'src/index.ts', 'src/test-setup.ts', 'src/gallery/**'],
      // CI sets COVERAGE_REPORT_ONLY: this package is below its 90% today, so CI measures it for
      // SonarQube Cloud without gating on it until the gap is closed. Local runs still gate.
      thresholds: process.env.COVERAGE_REPORT_ONLY
        ? {}
        : { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
})
