import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getCockpitControllerGetCockpitSummaryQueryKey, getTaxEstimateControllerGetQueryKey } from '@steuereule/api-client'
import { isOk, problemOf, type ApiProblem } from './businessKit'

/** The problem of a first read: a failed request, or the API's own non-200 answer; null while it is fine. */
export function queryProblem(query: { readonly isError: boolean; readonly data?: { readonly status: number; readonly data?: unknown } | undefined }): ApiProblem | null {
  if (query.isError) return { status: 0, code: null, message: null }
  if (query.data !== undefined && query.data.status !== 200) return problemOf(query.data)
  return null
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

/** Runs a write and says in one place what went wrong: the API's German reason, or a network line. */
export async function attempt<R extends { readonly status: number; readonly data?: unknown }>(run: () => Promise<R>): Promise<{ readonly ok: true; readonly response: R } | { readonly ok: false; readonly problem: ApiProblem }> {
  try {
    const response = await run()
    return isOk(response.status) ? { ok: true, response } : { ok: false, problem: problemOf(response) }
  } catch {
    return { ok: false, problem: { status: 0, code: null, message: null } }
  }
}
