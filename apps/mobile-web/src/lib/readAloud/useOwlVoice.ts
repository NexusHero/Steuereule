import { createContext, useContext, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { capabilitiesControllerGetCapabilities, getCapabilitiesControllerGetCapabilitiesQueryKey } from '@steuereule/api-client'
import { apiServerVoice, type ServerVoice } from './serverVoice'

function voiceIn(data: unknown): boolean {
  // The generated client resolves with success answers only (WEB-28): a failure never reaches here.
  const body = data as { readonly data?: { readonly eulenStimme?: boolean } | null } | null | undefined
  return body?.data?.eulenStimme === true
}

/** The voice answers are read with on this screen; null reads with the device's own voice. */
export const OwlVoiceContext = createContext<ServerVoice | null>(null)

export function useOwlVoice(): ServerVoice | null {
  return useContext(OwlVoiceContext)
}

/**
 * The owl's voice where this deployment has one (`GET /v1/capabilities`, ADR-0115), else null: the device's
 * own voice reads then. Read once through the query cache; unknown counts as none.
 */
export function useOwlVoiceOfDeployment(): ServerVoice | null {
  const queryClient = useQueryClient()
  const queryKey = getCapabilitiesControllerGetCapabilitiesQueryKey()
  const [available, setAvailable] = useState(() => voiceIn(queryClient.getQueryData(queryKey)))

  useEffect(() => {
    let alive = true
    queryClient
      .ensureQueryData({ queryKey, queryFn: ({ signal }) => capabilitiesControllerGetCapabilities({ signal }) })
      .then((data) => alive && setAvailable(voiceIn(data)))
      .catch(() => alive && setAvailable(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient])

  return available ? apiServerVoice : null
}
