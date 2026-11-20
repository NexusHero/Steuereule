import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Measured for SonarQube Cloud only, no threshold; the generated client is excluded there.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', ['lcov', { projectRoot: '../..' }]],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/generated/**'],
    },
  },
})
