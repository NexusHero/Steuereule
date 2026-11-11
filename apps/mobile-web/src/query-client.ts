export const RETRY_DELAY_BASE_MS = 400
export const RETRY_DELAY_CAP_MS = 2_000

export const QUERY_RETRY_COUNT = 2

export function retryDelayMs(attempt: number): number {
  return Math.min(RETRY_DELAY_BASE_MS * 2 ** attempt, RETRY_DELAY_CAP_MS)
}

export function maxRetryDelayBudgetMs(): number {
  let total = 0
  for (let attempt = 0; attempt < QUERY_RETRY_COUNT; attempt += 1) total += retryDelayMs(attempt)
  return total
}

export const APP_QUERY_DEFAULTS = {
  queries: {
    retry: QUERY_RETRY_COUNT,
    retryDelay: retryDelayMs,
  },
  // #450 5E: no offline queue — a save is attempted now and fails visibly, it is never parked until
  // the browser comes back online (that left "Weiter" without effect and without any notice).
  mutations: {
    networkMode: 'always',
  },
} as const
