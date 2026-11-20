import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Answers, InterviewOptions } from '@steuereule/core'
import { cockpitControllerGetCockpitSummary, getCockpitControllerGetCockpitSummaryQueryKey } from '@steuereule/api-client'

/** The interview declares self-employment: „Selbstständig“ or „Beides“ (ADR-0101). */
export function declaresSelfEmployment(answers: Answers): boolean {
  return answers.job === 'Selbstständig' || answers.job === 'Beides'
}

export interface SelfEmploymentCapability {
  /** SELBSTSTAENDIGE_ENABLED as the server reports it; false while unknown or when the read failed. */
  readonly enabled: boolean
  /** The capability is still being read: the interview must not show the Gewerbe gate in between. */
  readonly pending: boolean
  /** What the interview graph needs (`nextStepFor`, `remainingStepsFor`, `pageSteps` ...). */
  readonly options: InterviewOptions
}

function enabledIn(data: unknown): boolean {
  const body = data as { readonly status?: number; readonly data?: { readonly capabilities?: { readonly selbststaendig?: boolean } | null } | null } | null | undefined
  return body?.status === 200 && body.data?.capabilities?.selbststaendig === true
}

/**
 * The server's self-employment switch (ADR-0101 §20), read from the cockpit summary that always carries
 * it. It is read once through the query cache and not observed: a standing observer would refetch the
 * summary on every invalidation, which the screens that only need the switch must not cause.
 */
export function useSelfEmploymentCapability(taxYear: number): SelfEmploymentCapability {
  const queryClient = useQueryClient()
  const queryKey = getCockpitControllerGetCockpitSummaryQueryKey(taxYear)
  const [state, setState] = useState(() => {
    const cached = queryClient.getQueryData(queryKey)
    return cached === undefined ? { enabled: false, pending: true } : { enabled: enabledIn(cached), pending: false }
  })

  useEffect(() => {
    let alive = true
    queryClient
      .ensureQueryData({ queryKey, queryFn: ({ signal }) => cockpitControllerGetCockpitSummary(taxYear, { signal }) })
      .then((data) => alive && setState({ enabled: enabledIn(data), pending: false }))
      .catch(() => alive && setState({ enabled: false, pending: false }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, taxYear])

  return useMemo(() => ({ ...state, options: { selfEmployment: state.enabled } }), [state])
}
