import { useAuthCapabilitiesControllerGetCapabilities } from '@steuereule/api-client'

export type SocialAvailability =
  | 'available'
  | 'not-configured'
  | 'unknown'
  | 'unreachable'

export function useSocialSignInAvailable(provider: string): SocialAvailability {
  const { data, isPending, isError } = useAuthCapabilitiesControllerGetCapabilities({
    query: {
      staleTime: Infinity,
      retry: false,
    },
  })

  if (isError) return 'unreachable'
  if (isPending || !data) return 'unknown'

  const httpStatus = (data as { status: number }).status
  if (httpStatus !== 200) return 'unknown'

  return data.data.socialProviders?.includes(provider) ? 'available' : 'not-configured'
}
