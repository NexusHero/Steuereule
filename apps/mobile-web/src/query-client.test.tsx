// #307 — the Cockpit sat on an unbroken spinner for ~30s against an unreachable API before it
// reached the honest retry state it already had. Root cause was not the screen: `App.tsx` built
// a bare `new QueryClient()`, so every query inherited TanStack's own retry backoff.
//
// These assert the *effect* (how long a failing query takes to settle, and that a healthy one is
// untouched), not the mechanism — a test that only read back the config numbers would pass
// against any config, including the one that shipped the defect (ADR-0028).
import { describe, it, expect } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { APP_QUERY_DEFAULTS, QUERY_RETRY_COUNT, maxRetryDelayBudgetMs, retryDelayMs } from './query-client'

/** TanStack Query's own default backoff, from its docs: 1s, 2s, 4s … capped at 30s. */
function tanstackDefaultDelayMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30_000)
}

function clientUnderTest(): QueryClient {
  return new QueryClient({ defaultOptions: APP_QUERY_DEFAULTS })
}

describe('#307 — a failing first-paint query settles into an honest state in seconds, not half a minute', () => {
  it('control: TanStack\'s default backoff spends 7s in delays alone before a screen may say anything', () => {
    // The configuration that shipped the defect. Three retries at 1s + 2s + 4s — before adding
    // the per-request time each of those attempts also costs against a dead endpoint, which is
    // what took the observed wait to ~30s.
    let bare = 0
    for (let attempt = 0; attempt < 3; attempt += 1) bare += tanstackDefaultDelayMs(attempt)
    expect(bare).toBe(7_000)

    // The app's budget must be a fraction of that, or this ticket changed nothing.
    expect(maxRetryDelayBudgetMs()).toBeLessThan(bare / 4)
  })

  it('fix: a query that never answers reports failure within the stated budget', async () => {
    const client = clientUnderTest()
    let attempts = 0
    const startedAt = Date.now()

    await expect(
      client.fetchQuery({
        queryKey: ['#307-unreachable'],
        queryFn: async () => {
          attempts += 1
          throw new Error('network unreachable')
        },
      }),
    ).rejects.toThrow('network unreachable')

    const elapsed = Date.now() - startedAt
    // Initial attempt plus the configured retries — the query really did retry, so this is not
    // passing by having quietly given up on the first failure.
    expect(attempts).toBe(QUERY_RETRY_COUNT + 1)
    // The delays are what the user waits on; allow generous headroom for scheduling on CI.
    expect(elapsed).toBeLessThan(maxRetryDelayBudgetMs() + 1_500)
    // And decisively below what the bare client would have spent in delays alone.
    expect(elapsed).toBeLessThan(7_000)
  })

  it('fix: a healthy query is not retried and reports no error — the wait was not bought with a premature failure', async () => {
    const client = clientUnderTest()
    let attempts = 0

    const data = await client.fetchQuery({
      queryKey: ['#307-healthy'],
      queryFn: async () => {
        attempts += 1
        return 'cockpit summary'
      },
    })

    expect(data).toBe('cockpit summary')
    expect(attempts).toBe(1)
  })

  it('retries at least once, so a single dropped request is not reported as an outage', () => {
    // The mirror of this defect: "fixing" the wait by giving up immediately would assert an
    // outage on evidence too thin to carry it — the same class as #306 and #308.
    expect(QUERY_RETRY_COUNT).toBeGreaterThanOrEqual(1)
    expect(retryDelayMs(0)).toBeGreaterThan(0)
  })

  it('mutations are not retried by default — a retried write is a second write', () => {
    expect(APP_QUERY_DEFAULTS).not.toHaveProperty('mutations')
  })
})
