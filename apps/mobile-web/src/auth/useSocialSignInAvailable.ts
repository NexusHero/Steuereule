// REQ-008 — asks the server what this deployment can actually authenticate with, so the
// auth screens only offer social sign-in where it genuinely works.
//
// Social credentials live server-side by definition, so the client cannot tell a
// configured deployment from an unconfigured one on its own. Without this probe the
// Google button renders everywhere — local dev, CI, a fresh server, staging before setup
// — and every press ends in the provider-rejected error. Honesty is a product value here
// (ADR-0012), so an affordance that cannot work is not shown at all.
import { useAuthCapabilitiesControllerGetCapabilities } from '@steuereule/api-client'

/**
 * Whether the given social provider can be used right now.
 *
 * Returns `false` while the probe is still in flight or if it failed. That is deliberate:
 * showing the button and then removing it would flicker, and showing it on a failed probe
 * would be the exact dishonesty this exists to prevent. Email sign-in — which always works
 * — stays available throughout, so nothing is blocked on this answer.
 */
export function useSocialSignInAvailable(provider: string): boolean {
  const { data } = useAuthCapabilitiesControllerGetCapabilities({
    query: {
      // The answer changes only when the deployment is reconfigured and restarted, so it
      // is worth caching for the session rather than refetching per screen mount.
      staleTime: Infinity,
      // A failed probe must not leave the button hanging in an unknown state; treat it as
      // "not available" and stop retrying rather than flip the UI later.
      retry: false,
    },
  })

  // The generated client resolves to the whole HTTP envelope (`{ data, status, headers }`),
  // so the payload is one level in — same as ProfileScreen's `profileQuery.data.data`.
  return data?.data?.socialProviders?.includes(provider) ?? false
}
