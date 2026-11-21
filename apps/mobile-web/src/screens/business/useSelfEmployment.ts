import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { declaresBusiness, type Answers, type InterviewOptions } from '@steuereule/core'
import { capabilitiesControllerGetCapabilities, getCapabilitiesControllerGetCapabilitiesQueryKey } from '@steuereule/api-client'

/** The interview declares self-employment: „Selbstständig“, „Beides“ or a pensioner with a business (ADR-0101 §22). */
export function declaresSelfEmployment(answers: Answers): boolean {
  return declaresBusiness(answers)
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
  const body = data as { readonly status?: number; readonly data?: { readonly selbststaendig?: boolean } | null } | null | undefined
  return body?.status === 200 && body.data?.selbststaendig === true
}

/**
 * The server's self-employment switch (ADR-0101 §20), read from `GET /v1/capabilities`. Not from the cockpit
 * summary: that is null for a year nothing was entered for yet, so a new user would see the switch off right
 * where the interview first needs it (09b in CI, 21.11.2026). Read once through the query cache.
 */
export function useSelfEmploymentCapability(): SelfEmploymentCapability {
  const queryClient = useQueryClient()
  const queryKey = getCapabilitiesControllerGetCapabilitiesQueryKey()
  const [state, setState] = useState(() => {
    const cached = queryClient.getQueryData(queryKey)
    return cached === undefined ? { enabled: false, pending: true } : { enabled: enabledIn(cached), pending: false }
  })

  useEffect(() => {
    let alive = true
    queryClient
      .ensureQueryData({ queryKey, queryFn: ({ signal }) => capabilitiesControllerGetCapabilities({ signal }) })
      .then((data) => alive && setState({ enabled: enabledIn(data), pending: false }))
      .catch(() => alive && setState({ enabled: false, pending: false }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient])

  return useMemo(() => ({ ...state, options: { selfEmployment: state.enabled } }), [state])
}
