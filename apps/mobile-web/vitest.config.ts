import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'react-native': 'react-native-web',
      // react-native-svg ships Flow source jsdom can't parse; stub it for tests only.
      'react-native-svg': new URL('./src/test-stubs/react-native-svg.tsx', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // Must stay strictly greater than the `asyncUtilTimeout` configured in test-setup.ts.
    // Vitest's default is 5000ms — exactly the RTL budget — so the two expired together and
    // Vitest won the race: a slow `waitFor`/`findBy*` under `pnpm -r test`'s full parallel
    // load reported "Test timed out in 5000ms" instead of RTL's own error, which names the
    // failing query and prints the DOM. With headroom, RTL always times out first, so a
    // genuinely stuck query still fails fast (at its 5s budget) and with the better message;
    // only the contended-but-progressing case gets the extra room it needs.
    testTimeout: 15_000,
    include: ['src/**/*.test.tsx', '*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.tsx', 'src/test-setup.ts', 'src/i18n/**'],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
})
