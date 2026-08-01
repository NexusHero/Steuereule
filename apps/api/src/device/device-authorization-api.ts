// A narrow, hand-typed view of `auth.api`'s device-authorization plugin endpoints
// (#238, ADR-0024). `BetterAuthBundle.auth` is deliberately typed as the generic
// `Auth` (default type parameter, see `better-auth/dist/types/auth.d.mts`) so the DI
// seam stays decoupled from any one feature's plugin set — a good trade everywhere
// except here, where these endpoints genuinely exist at runtime (the plugin is
// registered in better-auth.ts) but are invisible to that generic type, because
// `Auth<Options>`'s endpoint inference only sees the plugins baked into `Options`'s
// *literal* type, and `buildOptions()` deliberately widens its return to the plain
// `BetterAuthOptions` interface.
//
// Shapes below are transcribed from the plugin's own installed
// `better-auth/plugins/device-authorization/index.d.mts` (1.6.24) — not guessed, the
// same "read the dist, not the assumption" standard the rest of ADR-0024 was built
// on. Re-check this file on any better-auth version bump, same as the disabledPaths
// list in better-auth.ts.
import type { Auth } from 'better-auth'

export interface DeviceAuthorizationApi {
  deviceCode(input: {
    body: { client_id: string; user_id?: string; scope?: string }
  }): Promise<{
    device_code: string
    user_code: string
    verification_uri: string
    verification_uri_complete: string
    expires_in: number
    interval: number
  }>
}

/** Narrows `auth.api` to the device-authorization endpoints this app calls
 *  server-side — one explicit, reviewable cast rather than `any` scattered at every
 *  call site. */
export function deviceAuthorizationApi(auth: Auth): DeviceAuthorizationApi {
  return auth.api as unknown as DeviceAuthorizationApi
}
