import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Vitest's jsdom pool runs tests through vite-node's SSR pipeline, which defaults to
  // Node-style resolution (the `main` field) for compatibility. That default is what broke
  // task 1a's router feasibility proof (#238): `react-native-screens` and
  // `react-native-safe-area-context` each ship a real web implementation, reachable through
  // their `module` (ESM/bundler) build, but their `main` (CJS) build's extensionless internal
  // `require`s resolve to the *native* files instead, which pull in `react-native/Libraries/*`'s
  // Flow-typed source — esbuild has no Flow support, and node_modules isn't run through the
  // project's Babel config (that's Metro's, not Vite's), so it fails to parse. Preferring
  // `module` over `main` is enough on its own to route through the packages' own web build end
  // to end; it needs no dependency inlining and no stub.
  ssr: { resolve: { mainFields: ['module', 'main'] } },
  resolve: {
    mainFields: ['module', 'main'],
    // Platform-extension resolution — `.web.js` over the bare name — the same convention Metro
    // applies for RN-Web builds, Vite has none of its own. This is what lets the two packages
    // above resolve to their real web file instead of guessing from a stub.
    extensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
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
    server: {
      deps: {
        // `@react-navigation/native-stack`'s `module` build (see `mainFields` above) uses bare,
        // extensionless relative imports (`./views/NativeStackView`), which is normal for a
        // bundler-targeted ESM build — Vite resolves those. Node's native ESM loader does not;
        // it requires an explicit extension. Vitest externalises node_modules to Node's loader
        // by default, which is where this broke. Inlining routes it through Vite instead, the
        // same as every other import in this config, no dependency-specific workaround.
        inline: [/@react-navigation\//],
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.tsx', 'src/test-setup.ts', 'src/i18n/**'],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
})
