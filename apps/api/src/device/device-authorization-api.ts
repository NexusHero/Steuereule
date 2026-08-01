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
  /** `/device` (GET) — claims the code onto the caller's session, if any (server-side
   *  only; see device.controller.ts for why the browser must never reach this
   *  directly). `headers` carries the *phone's* cookies. */
  deviceVerify(input: { headers: Headers; query: { user_code: string } }): Promise<{
    user_code: string
    status: string
  }>
  /** `/device/approve` — `headers` carries the *phone's* cookies; the plugin itself
   *  401s/403s if they don't resolve to the code's claimed userId. */
  deviceApprove(input: { headers: Headers; body: { userCode: string } }): Promise<{ success: boolean }>
  /** `/device/token` — `headers` carries the *desktop's* headers. Load-bearing, not
   *  incidental: `internalAdapter.createSession` reads `ipAddress`/`userAgent` off
   *  the current request context (`db/internal-adapter.mjs:163-166,177-178`) via
   *  these same headers — omit them and every QR-issued session shows a blank
   *  device in the list AC-5 exists to populate. */
  deviceToken(input: {
    headers: Headers
    body: { grant_type: 'urn:ietf:params:oauth:grant-type:device_code'; device_code: string; client_id: string }
  }): Promise<{
    access_token: string
    token_type: string
    expires_in: number
    scope: string
  }>
}

/** Narrows `auth.api` to the device-authorization endpoints this app calls
 *  server-side — one explicit, reviewable cast rather than `any` scattered at every
 *  call site. */
export function deviceAuthorizationApi(auth: Auth): DeviceAuthorizationApi {
  return auth.api as unknown as DeviceAuthorizationApi
}
