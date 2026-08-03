// #240 — control proof (ADR-0021: "passing is the state the broken version was also in", so a
// race is never proven by repeating it — it's proven by making it deterministic, then breaking
// it). The real flake reproduces roughly once in nine root-level `pnpm test` runs; faking time
// across nanostores' own `STORE_UNMOUNT_DELAY` instead turns that into a binary, every-run
// control: red without the fix, green with it, in the same process, no repetition needed.
//
// This exercises the REAL better-auth session atom via `createAppAuthClient` — this app's one
// client-construction site — not a lookalike store, so it's a proof of the actual traced chain
// (nanostores' deferred UNMOUNT timer -> better-auth's `session-refresh.mjs` `cleanup()` ->
// `broadcast-channel.mjs`'s `window.removeEventListener`), not just of nanostores in the
// abstract. See #240 and Musti's ruling on it for the full mechanism; `../test-setup.ts` is where
// the fix (`cleanStores()` in the shared `afterEach`) actually ships for every test file.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanStores, STORE_UNMOUNT_DELAY } from 'nanostores'
import type { createAppAuthClient as CreateAppAuthClient } from './auth-client'

const BASE_URL = 'http://localhost:3000'

/** Mounts (subscribes to) and immediately unmounts a fresh client's session store, returning it
 * — this is exactly what happens the instant a `useSession()` consumer like `DatenschutzScreen`
 * unmounts: the last subscriber drops, and nanostores schedules its real, deferred destroy.
 *
 * Deliberately goes through `vi.importActual` rather than the module-level `import` other test
 * files use: `test-setup.ts` (this suite's shared setup file) `vi.mock`s `./auth/auth-client` to
 * install the very fix this test proves, so a plain `import` here would exercise the harness's
 * wiring instead of the raw mechanism — this test needs to stand on its own regardless of that
 * wiring, not lean on it. */
async function mountAndUnmountSessionStore() {
  const { createAppAuthClient } = await vi.importActual<{ createAppAuthClient: typeof CreateAppAuthClient }>('./auth-client')
  const client = createAppAuthClient(BASE_URL)
  const sessionStore = client.$store.atoms.session
  if (!sessionStore) {
    throw new Error('better-auth did not expose a `session` atom on $store.atoms — test assumption broken')
  }
  const unsubscribe = sessionStore.listen(() => {})
  unsubscribe()
  return sessionStore
}

/** Simulates Vitest's own end-of-file jsdom teardown, which is what actually happens (at a file
 * boundary, under load) before the deferred timer this test fakes its way past ever fires. */
function tearDownWindow(): () => void {
  const realWindow = globalThis.window
  // @ts-expect-error — simulating jsdom's real teardown, which really does delete `window`.
  delete globalThis.window
  return () => {
    globalThis.window = realWindow
  }
}

describe('#240 — better-auth session store deferred-unmount timer vs. cleanStores()', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('control: without cleanStores(), the deferred destroy fires into a torn-down window', async () => {
    vi.useFakeTimers()
    // Mounting/unmounting is what schedules the deferred timer this test breaks against; nothing
    // afterwards needs the store itself.
    await mountAndUnmountSessionStore()
    const restoreWindow = tearDownWindow()

    try {
      expect(() => vi.advanceTimersByTime(STORE_UNMOUNT_DELAY)).toThrow(/window is not defined/)
    } finally {
      restoreWindow()
    }
  })

  it('fix: cleanStores() drains the destroy synchronously, so the same deferred timer is a no-op', async () => {
    vi.useFakeTimers()
    const sessionStore = await mountAndUnmountSessionStore()

    // This is exactly what `test-setup.ts`'s shared `afterEach` now does for every client
    // `createAppAuthClient` produces (via its `vi.mock` there) — done here directly, without the
    // mock's indirection, so this test proves the mechanism, not the wiring around it.
    cleanStores(sessionStore)

    const restoreWindow = tearDownWindow()
    try {
      expect(() => vi.advanceTimersByTime(STORE_UNMOUNT_DELAY)).not.toThrow()
    } finally {
      restoreWindow()
    }
  })
})
