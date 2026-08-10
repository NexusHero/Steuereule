// The app's TanStack Query defaults, extracted from App.tsx so they can be asserted (#307).
//
// Until #307 the root was a bare `new QueryClient()`, which meant TanStack's own defaults:
// three retries with an exponential backoff capped at 30s. On an unreachable API a first-paint
// query therefore sat on an unbroken spinner for ~30 seconds before reaching the honest retry
// state the screen already had. ADR-0012's honest states only help a user who is still there
// to read them; half a minute of nothing is the window in which someone concludes the app is
// broken and closes it.
//
// Every screen test builds its own client with `retry: false`, so before this file the
// production retry configuration was exercised by nothing at all — the value a real user got
// was the one value under no test. That is why these live here, named and exported, rather
// than inline at the construction site.

/**
 * Delay before retry `attempt` (0-based), in ms: 400, 800 — capped at {@link RETRY_DELAY_CAP_MS}.
 *
 * Deliberately far below TanStack's 30s cap. The budget this is chosen against is the whole
 * point of #307: with {@link QUERY_RETRY_COUNT} attempts the delays sum to
 * {@link maxRetryDelayBudgetMs}, so a query whose requests fail fast settles into its honest
 * state in about a second rather than in half a minute.
 */
export const RETRY_DELAY_BASE_MS = 400
export const RETRY_DELAY_CAP_MS = 2_000

/**
 * How many times a failed query is retried before the screen is allowed to say so.
 *
 * Not zero: a single dropped request is common enough on mobile that giving up immediately
 * would trade #307's defect for its mirror — an error state asserted on evidence too thin to
 * support it, which is the same class as #306 and #308. Two retries is the smallest number
 * that still distinguishes "one packet lost" from "nothing is answering".
 */
export const QUERY_RETRY_COUNT = 2

export function retryDelayMs(attempt: number): number {
  return Math.min(RETRY_DELAY_BASE_MS * 2 ** attempt, RETRY_DELAY_CAP_MS)
}

/** Total time spent waiting between attempts before a query may report failure. */
export function maxRetryDelayBudgetMs(): number {
  let total = 0
  for (let attempt = 0; attempt < QUERY_RETRY_COUNT; attempt += 1) total += retryDelayMs(attempt)
  return total
}

/**
 * Defaults for the app's single QueryClient.
 *
 * Queries only. Mutations keep TanStack's no-retry default deliberately: a retried mutation is
 * a second write, and nothing in this app is known to be idempotent enough to make that safe
 * by default.
 */
export const APP_QUERY_DEFAULTS = {
  queries: {
    retry: QUERY_RETRY_COUNT,
    retryDelay: retryDelayMs,
  },
} as const
