// Control proof for the fix in vitest.config.ts (#238, Musti's review of 2026-08-01 on
// 810a513/dfe4895) — asserts, not just documents, that `react-native-web` resolves under this
// test harness the same way the shipped bundle resolves it. A comment is a claim; this is the
// check that fails if the claim stops being true.
//
// Metro's own `resolverMainFields: ['react-native', 'browser', 'main']`
// (`@expo/metro-config@0.20.18`, `build/ExpoMetroConfig.js:182`) has no `module`; react-native-web
// declares neither `react-native` nor `browser`, so the bundle lands on `main` -> `dist/cjs/index.js`.
//
// Two things have to hold together for that to also be true here, and this test asserts both:
//
// 1. Node's own resolver — the one `react-native-web`'s Vitest-side externalisation delegates
//    to — lands on that exact file. `createRequire(...).resolve(...)` runs that real algorithm
//    directly, not a re-implementation of it.
// 2. Vite's *own* resolver never got far enough into `react-native-web` to have loaded any of its
//    files in the first place — otherwise (1) would be true by coincidence while the actual, live
//    import (`import { View } from 'react-native'`, aliased to `react-native-web`) went through a
//    different file entirely. `reactNativeWebResolutionCanary` (registered in vitest.config.ts)
//    records every id resolved *inside* the package, to a file (see that module for why a file
//    and not an in-memory array); resetting it, then triggering the same import the app's own
//    code goes through, then reading it back, is what makes this the mechanism actually in play.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { resetCanary, readCanaryHits } from './reactNativeWebResolutionCanary'

describe('react-native-web resolves under Vitest exactly where Metro resolves it in the shipped bundle', () => {
  it('lands on dist/cjs/index.js — main, not module, matching resolverMainFields having no `module`', () => {
    const resolved = createRequire(import.meta.url).resolve('react-native-web')
    expect(resolved.endsWith('/dist/cjs/index.js')).toBe(true)
  })

  it("is genuinely externalised to Node, not routed through Vite's own resolver", async () => {
    resetCanary()
    // The same alias the app's own code goes through (`react-native` -> `react-native-web`,
    // resolve.alias in vitest.config.ts) — not `react-native-web` directly, which would only
    // prove the bare specifier resolves, not that the app's actual import path does.
    await import('react-native')
    expect(readCanaryHits()).toEqual([])
  })
})
