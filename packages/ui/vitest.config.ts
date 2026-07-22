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
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.tsx', 'src/index.ts', 'src/test-setup.ts', 'src/gallery/**'],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
})
