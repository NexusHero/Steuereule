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
