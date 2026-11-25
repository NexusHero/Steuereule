import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getCockpitControllerGetCockpitSummaryQueryKey, getTaxEstimateControllerGetQueryKey } from '@steuereule/api-client'
import { problemOf, type ApiProblem } from './businessKit'

/** The problem of a first read: every failure arrives as `isError` (WEB-28); null while it is fine or pending. */
export function queryProblem(query: { readonly isError: boolean; readonly error?: unknown }): ApiProblem | null {
  return query.isError ? problemOf(query.error) : null
}

/** After every write the whole area's reads are stale (the book changes profit, VAT, trade tax and the estimate). */
export function useRefreshBusiness(taxYear: number): () => void {
  const queryClient = useQueryClient()
  return useCallback(() => {
    const prefix = `/v1/steuerjahre/${taxYear}/selbststaendig`
    void queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && q.queryKey[0].startsWith(prefix) })
    void queryClient.invalidateQueries({ queryKey: getCockpitControllerGetCockpitSummaryQueryKey(taxYear) })
    void queryClient.invalidateQueries({ queryKey: getTaxEstimateControllerGetQueryKey(taxYear) })
  }, [queryClient, taxYear])
}

/** Runs a write and says in one place what went wrong: every failure rejects (an ApiError, a NetworkError). */
export async function attempt<R>(run: () => Promise<R>): Promise<{ readonly ok: true; readonly response: R } | { readonly ok: false; readonly problem: ApiProblem }> {
  try {
    return { ok: true, response: await run() }
  } catch (error) {
    return { ok: false, problem: problemOf(error) }
  }
}

/**
 * One write at a time (NC-03): a double tap on „Buchen“ books once. The ref closes the gap before React
 * re-renders the disabled button; `busy` disables it for the eye.
 */
export function useSingleFlight(): { readonly run: (task: () => Promise<unknown>) => Promise<void>; readonly busy: boolean } {
  const running = useRef(false)
  const [busy, setBusy] = useState(false)
  const run = useCallback(async (task: () => Promise<unknown>) => {
    if (running.current) return
    running.current = true
    setBusy(true)
    try {
      await task()
    } finally {
      running.current = false
      setBusy(false)
    }
  }, [])
  return { run, busy }
}
