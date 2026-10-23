import { afterAll, afterEach, beforeAll, vi } from 'vitest'
import { cleanup, configure } from '@testing-library/react'
import { cleanStores, type WritableAtom } from 'nanostores'
import { server } from './test-msw-server'

// RTL's default `asyncUtilTimeout` (findBy*/waitFor, 1000ms) is tuned for an
// uncontended CI runner. Under `pnpm -r test`'s full monorepo parallel run (every
// workspace's Vitest pool sharing the same CPUs), that budget intermittently isn't
// enough for a real async render (App.test.tsx's full Login->Registrierung->signup
// flow, RegistrierungScreen.test.tsx's MSW-backed submit) to resolve — not a logic
// bug, just CPU contention, but it produced a flaky red on an otherwise-passing test.
// Raising the budget for this suite only (isolated `apps/mobile-web` runs were never
// the problem) makes `pnpm -r test` deterministic without masking a genuinely stuck
// query, which would still exceed even this larger budget.
// Paired with `testTimeout` in vitest.config.ts, which must stay strictly larger than this —
// otherwise both budgets expire at once and Vitest's vaguer timeout wins the race.
configure({ asyncUtilTimeout: 5_000 })

// #240 — a shared-harness fix, not a screen patch. nanostores' deferred UNMOUNT timer
// (`nanostores/lifecycle`'s `STORE_UNMOUNT_DELAY`) can fire after Vitest tears this file's
// `window` down; `cleanStores()` runs the destroy synchronously and flips the store's `active`
// flag false first, so the already-scheduled timer's own guard reads false and no-ops instead of
// throwing. Full mechanism, and why the throw (not the destroy's own trivial work — a handful of
// `Set` deletes and `removeEventListener` calls, nowhere near a 5s budget) is what actually costs
// a later file time under `pnpm test`'s contended load: #240 and Musti's ruling on it. Control
// proof for this exact mechanism: `./auth/session-store-cleanup.test.tsx`.
//
// Wired at the ONE seam every `authClient.useSession()` consumer passes through —
// `createAppAuthClient`, this app's single client-construction site (`./auth/auth-client.ts`'s
// own doc comment) — rather than into any particular screen, so it drains generically for
// whichever component(s) use `useSession()`, not just today's one caller, `DatenschutzScreen`. No
// product code is touched — only this shared harness module's own module graph is intercepted.
const pendingSessionStores: WritableAtom<unknown>[] = []
vi.mock('./auth/auth-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./auth/auth-client')>()
  return {
    ...actual,
    createAppAuthClient: (baseUrl: string) => {
      const client = actual.createAppAuthClient(baseUrl)
      const sessionStore = client.$store.atoms.session
      if (sessionStore) pendingSessionStores.push(sessionStore)
      return client
    },
  }
})

// jsdom implements no `ResizeObserver` at all — a missing platform API, not a product
// dependency. `@react-navigation/elements`' `useFrameSize` (pulled in by the router, #238)
// observes its container for frame-size tracking; without this it throws on mount before a
// single assertion runs. The precedent is `src/test-stubs/react-native-svg.tsx` (a real
// dependency's Flow-typed source jsdom can't parse — stubbed because there is no other way to
// run it here at all), not the AbortSignal patch further down in this file, which fixes a
// Node-version incompatibility in a control flow the app itself owns end to end. Nothing here
// replaces the *subject under test* — no screen's own logic reads or reacts to a resize; this
// only keeps `useFrameSize`'s own `observe()` call from throwing during mount.
// Standing limitation this leaves: `useFrameSize` never actually sees a frame size under this
// suite, so it cannot be exercised here — real resize behaviour is the Chromium-backed e2e
// gate's job (docs/process/delivery-pipeline.md § Browser gates), not jsdom's, and belongs in
// Salih's T1 pass for this slice, not only in this comment.
class NoopResizeObserver implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver

// Node ≥26 ships experimental Web Storage globals: `globalThis.localStorage` and
// `sessionStorage` become own accessors on the global object (with no `--localstorage-file`,
// `localStorage` reads back `undefined`). Vitest's jsdom environment only copies jsdom's
// `window.localStorage` onto the global when the key does *not* already exist there — and it now
// does — so jsdom's Storage is skipped and `window.localStorage` stays `undefined`. The two
// ADR-0008 guards (`ProfilScreen`/`req-012-onboarding-vertical-join`) fail at collection time
// under Node 26 because the store they guard does not exist. Installing our own Storage as a
// *data* property replaces Node's accessor (a plain `globalThis.localStorage = …` would just
// invoke its setter), so `localStorage` is controllable under Node 24 *and* 26 alike. No product
// code reads or writes `localStorage` (that is the whole point of ADR-0008 — the guard asserts
// its absence), so this mock only exists to be observed, never exercised.
//
// Why own properties instead of a Map: `test-storage-guard.test.tsx` (#329 finding 2) proves
// the stand-in's shape against jsdom's real Storage — stored keys are *own enumerable
// properties* (so `Object.keys`/spreads see them), the API (`getItem`/`setItem`/`removeItem`/
// `clear`/`key`/`length`) lives on the prototype. A Map-backed stand-in broke that contract:
// the guard's control test (a bare spread must leak the pre-existing keys) failed because the
// Map hid them. Mirroring jsdom's own shape keeps every #323/#329/#333 guard semantics intact.
class InMemoryStorage {
  get length(): number {
    return Object.keys(this).length
  }

  clear(): void {
    for (const key of Object.keys(this)) {
      delete (this as unknown as Record<string, unknown>)[key]
    }
  }

  getItem(key: string): string | null {
    const value = (this as unknown as Record<string, unknown>)[key]
    return typeof value === 'string' ? value : null
  }

  key(index: number): string | null {
    return Object.keys(this)[index] ?? null
  }

  removeItem(key: string): void {
    delete (this as unknown as Record<string, unknown>)[key]
  }

  setItem(key: string, value: string): void {
    ;(this as unknown as Record<string, unknown>)[key] = String(value)
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new InMemoryStorage(),
  configurable: true,
  writable: true,
  enumerable: true,
})

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })

  // Node-version-specific test-harness workaround, not a product bug (see the commit that
  // introduced this for the full root-cause writeup): vitest's jsdom environment shadows the
  // real Node global with jsdom's own `AbortController`/`AbortSignal` implementation (jsdom
  // has no `fetch` of its own, so `fetch`/`Request`/`Response` stay Node's real ones, but
  // `AbortController`/`AbortSignal` are always jsdom's). Every orval-generated query hook
  // forwards TanStack Query's abort signal into our one fetch call site
  // (packages/api-client/src/http-client.ts). Node 22's bundled undici accepted that
  // jsdom-flavoured signal; Node 24's bundled undici validates `RequestInit.signal` with a
  // strict same-realm `instanceof AbortSignal` and rejects it — msw's own fetch interceptor
  // constructs its internal Request from the same init and throws before it ever reaches a
  // handler, so every GET/PUT in a test looks like a genuine network failure (the honest
  // load-error UI renders, not a stuck loading state) with no code path involved that a
  // screen-level or handler-level fix could touch. Stripping the signal for tests only (real
  // callers in the browser/server keep real cancellation) sidesteps the incompatible class
  // without needing to reach for Node's now-shadowed native AbortSignal, which vitest's jsdom
  // environment makes otherwise unreachable once populated.
  const fetchWithoutJsdomSignal = globalThis.fetch
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (init && 'signal' in init) {
      const { signal: _signal, ...rest } = init
      return fetchWithoutJsdomSignal(input, rest)
    }
    return fetchWithoutJsdomSignal(input, init)
  }) as typeof fetch
})
afterEach(() => {
  server.resetHandlers()
  // RTL's `cleanup()` first: unmounting any still-mounted `useSession()` consumer is what drops
  // its store's last subscriber and schedules nanostores' deferred destroy timer in the first
  // place — `cleanStores()` below needs that to have already happened so there's something to
  // drain.
  cleanup()
  cleanStores(...pendingSessionStores)
  pendingSessionStores.length = 0
})
afterAll(() => server.close())
