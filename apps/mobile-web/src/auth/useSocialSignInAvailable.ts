// REQ-008 — asks the server what this deployment can actually authenticate with, so the
// auth screens only offer social sign-in where it genuinely works.
//
// Social credentials live server-side by definition, so the client cannot tell a
// configured deployment from an unconfigured one on its own. Without this probe the
// Google button renders everywhere — local dev, CI, a fresh server, staging before setup
// — and every press ends in the provider-rejected error. Honesty is a product value here
// (ADR-0012), so an affordance that cannot work is not shown at all.
//
// #283 (Musti's refinement block, §3(a)): this used to fold "probe failed", "probe still in
// flight" and "provider genuinely not configured" into a single `false` — right when the
// button was the only consumer, wrong now that a caller (LoginScreen's shared-outage banner)
// needs to tell "the deployment answered: no Google here" apart from "we don't know yet/the
// probe itself is failing". Both call sites (LoginScreen.tsx, RegistrierungScreen.tsx) must
// render the widened state — fixing one and leaving the other silently disappearing is worse
// than fixing neither.
import { useAuthCapabilitiesControllerGetCapabilities } from '@steuereule/api-client'

/**
 * - `'available'` — the deployment answered 200 and the provider is in the list.
 * - `'not-configured'` — the deployment answered 200 and the provider is genuinely absent. A
 *   confirmed, positive answer: the DS's own dashed fallback applies here (`auth.html`), not
 *   silence.
 * - `'unknown'` — the probe is still in flight, or it failed. Deliberately not split further:
 *   telling the two apart from here would need the raw query object at every call site: this
 *   hook's job is "can I show the button", nothing about *why* not. A caller that also needs to
 *   know whether the deployment is unreachable (LoginScreen's shared-outage banner) derives that
 *   from a surface that already carries a real reason — the QR column's own `error.reason`
 *   (#283 §3(b)/(c)) — not from re-deriving it here.
 */
export type SocialAvailability = 'available' | 'not-configured' | 'unknown'

export function useSocialSignInAvailable(provider: string): SocialAvailability {
  const { data, isPending, isError } = useAuthCapabilitiesControllerGetCapabilities({
    query: {
      // The answer changes only when the deployment is reconfigured and restarted, so it
      // is worth caching for the session rather than refetching per screen mount.
      staleTime: Infinity,
      // A failed probe must not leave the button hanging in an unknown state; treat it as
      // "not available" and stop retrying rather than flip the UI later.
      retry: false,
    },
  })

  if (isPending || isError || !data) return 'unknown'

  // The generated client resolves to the whole HTTP envelope (`{ data, status, headers }`),
  // so the payload is one level in — same as ProfileScreen's `profileQuery.data.data`. The
  // generated type only documents this endpoint's 200 (narrows `.status` to that literal),
  // even though a real deployment can still answer something else — widen it the same way
  // GeraetefreigabeScreen.tsx and useDeviceQrCode.ts already do, rather than trusting the
  // generated type. A non-2xx that still resolved (httpClient never throws on one) carries no
  // positive answer either — fail to 'unknown', not to a confident 'not-configured'.
  const httpStatus = (data as { status: number }).status
  if (httpStatus !== 200) return 'unknown'

  return data.data.socialProviders?.includes(provider) ? 'available' : 'not-configured'
}
