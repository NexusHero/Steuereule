// Second half of the control proof for vitest.config.ts's fix (#238, Musti's review of
// 2026-08-01) — see reactNativeWebProductionParity.test.tsx for the first half.
//
// `require.resolve('react-native-web')` on its own proves *where Node's resolver lands*, but
// Node's resolver runs identically no matter what vitest.config.ts says — it can't tell you
// whether Vite's own resolver got involved with react-native-web at all, which is exactly the
// regression this whole fix is about (a global `resolve.mainFields` silently routing
// react-native-web through Vite's resolver instead of leaving it externalised to Node). This
// plugin closes that gap: it records every id any resolveId call is asked to resolve that lives
// inside `node_modules/react-native-web/`. Every plugin sees the *bare* top-level `react-native
// -web` specifier once — that's normal and harmless, every plugin in the chain gets offered every
// import — so this only records *resolved, absolute* paths inside the package, which only happen
// if something actually walked into its module graph.
//
// Communication is a file, not an in-memory array — deliberately, and not for style. Vite loads
// this plugin (and this module) once, itself, to build the config; the test that reads the result
// later runs inside vite-node's own, separate module-execution pipeline, which re-evaluates this
// same source file as a *second, unrelated* module instance. An in-memory array does not bridge
// that: it was tried first, and it silently read back empty on every run, passing regardless of
// whether the plugin ever fired — verified directly (a `console.error` inside `resolveId` showed
// real hits climbing past a dozen while the test's own imported array stayed `[]`), so this is
// not a hypothetical. The two processes/instances do share a real filesystem, so a file does.
import { appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Plugin } from 'vite'

const CANARY_FILE = join(tmpdir(), 'steuereule-mobile-web-rnw-resolution-canary.log')

export function reactNativeWebResolutionCanary(): Plugin {
  return {
    name: 'react-native-web-resolution-canary',
    enforce: 'pre',
    resolveId(source) {
      if (source.includes('/node_modules/react-native-web/')) {
        appendFileSync(CANARY_FILE, source + '\n')
      }
      return null
    },
  }
}

/** Clears any previous run's hits — call before the import under test, in the same test/process
 * that will read `readCanaryHits()` after it, so the two are never racing another test file's
 * own, unrelated import of `react-native`. */
export function resetCanary(): void {
  if (existsSync(CANARY_FILE)) rmSync(CANARY_FILE)
}

export function readCanaryHits(): string[] {
  if (!existsSync(CANARY_FILE)) return []
  return readFileSync(CANARY_FILE, 'utf8').split('\n').filter(Boolean)
}
