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

// #240 — better-auth's session store (the nanostores atom behind every `authClient.useSession()`)
// uses nanostores' own deferred-unmount lifecycle: its last unsubscribe doesn't destroy
// synchronously, it schedules a REAL `setTimeout` (`nanostores/lifecycle`'s
// `STORE_UNMOUNT_DELAY`, 1000ms) before running the store's teardown — which, for the session
// atom, is better-auth's `session-refresh.mjs` `cleanup()`, and that in turn removes the
// `storage` listener `broadcast-channel.mjs`'s `setup()` attached to `window`
// (`window.removeEventListener(...)`).
//
// Vitest tears this file's jsdom `window` down as soon as its tests finish (`isolate: true`, the
// default, and unchanged here). If that 1000ms timer is still pending at that point, it fires
// later, into an environment that no longer exists: "ReferenceError: window is not defined ...
// caught after test environment was torn down" if it fires on its own (#220's shape), or —
// because it's a real, uncancellable Node timer running on the shared process clock, not
// anything scoped to this file — it can land mid-flight in whichever *next* file Vitest happens
// to run under contended, root-level `pnpm test` load, quietly eating part of that file's
// `findBy*`/`waitFor` budget instead (#222's shape, reproduced on `App.test.tsx`). Traced in
// #240 (see that ticket, and Musti's ruling on it, for the full chain); the control proof for
// this exact mechanism lives in `./auth/session-store-cleanup.test.ts`.
//
// nanostores ships its own escape hatch for exactly this, rather than needing one invented here:
// `cleanStores()` runs a store's deferred UNMOUNT destroys *synchronously* and flips the store's
// internal `active` flag off, so when the already-scheduled real timer eventually fires, its own
// guard (`if ($store.active && !$store.lc)`, `nanostores/lifecycle/index.js`) is false and it's a
// no-op — entschärft, not just outrun. This wires that escape hatch into the ONE seam every
// `authClient.useSession()` consumer passes through, `createAppAuthClient` — this app's single
// client-construction site (`./auth/auth-client.ts`'s own doc comment) — rather than into any
// particular screen, so every test file's client(s) get drained generically, for whichever
// component(s) call `useSession()` today or are added later (not just today's one caller,
// `DatenschutzScreen`). No product code is touched by this — only this shared test harness
// module's own module graph is intercepted.
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
