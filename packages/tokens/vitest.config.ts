import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // lcov feeds SonarQube Cloud; paths relative to the repo root so Sonar can match them.
      reporter: ['text-summary', ['lcov', { projectRoot: '../..' }]],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
})
