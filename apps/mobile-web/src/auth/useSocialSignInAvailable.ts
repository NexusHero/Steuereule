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
 *   know whether the deployment is unreachable derives that from a surface carrying a real
 *   reason, not from re-deriving it here.
 *
 *   Which surface depends on what is being claimed, and #336's F1/F8 split those apart. The
 *   shared-outage banner names a screen-wide cause, so only the login form's own submit failing
 *   at transport level may drive it — the QR column's `error.reason` cannot establish that, and
 *   using it there put "Unsere Server antworten nicht" directly above a live wrong-password
 *   message. Deciding whether THIS slot stays silent or says it cannot tell is a different
 *   question that claims nothing about the API, and that one does read the QR column's reason
 *   (#283 §3(b)/(c)): any real transport failure is enough to know a still-probing slot should
 *   speak rather than vanish.
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
