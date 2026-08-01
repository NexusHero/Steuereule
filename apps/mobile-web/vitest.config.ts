import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { screensWebPlatformResolver } from './vitest.rn-navigation-resolver'
import { reactNativeWebResolutionCanary } from './reactNativeWebResolutionCanary'

// Router feasibility proof (#238 task 1a) needed two fixes to run @react-navigation/native +
// native-stack + react-native-screens + react-native-safe-area-context under this app's real
// Vitest+jsdom harness, neither of them global:
//
// 1. `@react-navigation/*` packages' only build (`main` *is* their bundler/ESM build — they ship
//    no separate CJS output) uses bare, extensionless relative imports, which Vite's own
//    resolver handles natively but Node's native loader does not (Node's ESM resolution requires
//    an explicit extension). Vitest externalises node_modules to Node's loader by default, which
//    is where this broke — `deps.inline` below routes just these three package name patterns
//    through Vite instead, and needs nothing else: Vite's default extension list already
//    resolves their extensionless imports correctly once it's the one doing the resolving.
// 2. `react-native-screens`/`react-native-safe-area-context` ship a real web implementation next
//    to their native one (`Foo.web.js` beside `Foo.js`), and Vite's default `.js`-only extension
//    list deterministically picks the native, Flow-typed one whenever both exist — Flow syntax
//    (e.g. a `typeof` type operator) isn't valid JS, and esbuild has no Flow support, so it fails
//    to parse. `screensWebPlatformResolver` (./vitest.rn-navigation-resolver.ts) fixes this,
//    scoped to exactly these two packages' own relative imports — see that file for why it is a
//    dedicated plugin and not `resolve.extensions`.
//
// **What must never come back: a *global* `resolve.mainFields`/`resolve.extensions` override.**
// The first version of this fix (810a513) used one, and Musti's review (2026-08-01, on
// 810a513/dfe4895) caught what it actually did: those options apply to every package Vitest
// routes through Vite, not just the three above, and it silently moved `react-native-web` (and
// `@testing-library/{dom,react}`, `memoize-one`) off the file the shipped bundle actually loads.
// Metro's own `resolverMainFields: ['react-native', 'browser', 'main']`
// (`@expo/metro-config@0.20.18`, `build/ExpoMetroConfig.js:182`) has no `module`; react-native-web
// declares neither `react-native` nor `browser`, so the bundle lands on `main` → `dist/cjs/index.js`
// — preferring `module` moved the *test* off that file, permanently, on the entire UI-primitive
// layer, while the suite stayed green throughout (verified after the fact by comparing resolved
// module paths and rendered DOM old vs new — a green suite alone never would have caught it).
// `reactNativeWebProductionParity.test.tsx` asserts that file directly now — both that
// `react-native-web` resolves to the file the shipped bundle uses (via `require.resolve`, the
// actual mechanism its externalisation delegates to) *and*, via `reactNativeWebResolutionCanary`
// below, that Vite's own resolver never gets far enough into `react-native-web` to have loaded
// any of its own files. Control-proved (ADR-0021): reintroduced this exact `resolve.mainFields`
// override with nothing else changed, reran, watched the second assertion go red — the canary
// recorded 392 resolved paths inside the package, the first one `dist/index.js` (the `module`
// build) — reverted, reran, green again. Both files carry the full account, including why the
// canary is a file and not the in-memory array it started as (that array read back empty on
// every run, including the broken one, and would have too here).
export default defineConfig({
  plugins: [react(), screensWebPlatformResolver(), reactNativeWebResolutionCanary()],
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
    server: {
      deps: {
        // Scoped by package directory, nothing else — see the file-level comment above. These
        // match against the *resolved* id (an absolute path), not the bare specifier, which is
        // why each pattern anchors on `/node_modules/<pkg>/`.
        inline: [/\/node_modules\/@react-navigation\//, /\/node_modules\/react-native-screens\//, /\/node_modules\/react-native-safe-area-context\//],
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
