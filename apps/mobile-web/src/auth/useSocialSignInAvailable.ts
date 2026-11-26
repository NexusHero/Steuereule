import { isApiError, useAuthCapabilitiesControllerGetCapabilities } from '@steuereule/api-client'

export type SocialAvailability =
  | 'available'
  | 'not-configured'
  | 'unknown'
  | 'unreachable'

export function useSocialSignInAvailable(provider: string): SocialAvailability {
  const { data, isPending, isError, error } = useAuthCapabilitiesControllerGetCapabilities({
    query: {
      staleTime: Infinity,
      retry: false,
    },
  })

  // A status the server answered (a rejected ApiError) is an answer — "unknown", not "unreachable" (#336).
  if (isError) return isApiError(error) ? 'unknown' : 'unreachable'
  if (isPending || !data) return 'unknown'

  return data.data.socialProviders?.includes(provider) ? 'available' : 'not-configured'
}
