import { afterAll, afterEach, beforeAll } from 'vitest'
import { cleanup, configure } from '@testing-library/react'
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
configure({ asyncUtilTimeout: 5_000 })

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
  cleanup()
})
afterAll(() => server.close())
