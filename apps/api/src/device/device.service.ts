// The `/v1/device/code` application logic (#238, RFC 8628 §3.2, ADR-0024): mints a
// device/user code pair via better-auth's `deviceAuthorization` plugin — called
// server-side (`auth.api.deviceCode(...)`), never over the plugin's own (disabled)
// HTTP route — then stamps the desktop's own request context (User-Agent/IP/region/
// time) onto the row the plugin's adapter call just created. That stamped context is
// what AC-3's match-verification screen renders later (task 2's `/v1/device/pending`).
//
// Deliberately no @UseGuards(UserContextGuard) on the controller this feeds: the
// desktop requesting a code is not authenticated at this point in the flow (decision
// 1 — the *phone's* session is what matters, established later at `/device`'s claim
// step). Minting a code needs no identity of its own.
import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from '../auth/auth.tokens.js'
import { deviceAuthorizationApi } from './device-authorization-api.js'
import { translateDeviceApiError } from './device-api-error.js'
import { DEVICE_CODE_REPOSITORY, type DeviceCodeRepository } from './device-code.repository.js'
import type { DeviceCodeResponseDto } from './dto/device-code-response.dto.js'
import type { DevicePendingResponseDto } from './dto/device-pending-response.dto.js'
import { REGION_RESOLVER, type RegionResolver } from './region/region-resolver.js'

/** This app is the device flow's one and only first-party client — no third-party
 *  integrator ever calls `/v1/device/code`, so a single fixed `client_id` is correct
 *  (the plugin requires the field; nothing here validates it against a registry, see
 *  `validateClient` left unset in better-auth.ts). */
export const DEVICE_AUTHORIZATION_CLIENT_ID = 'steuereule-web'

export interface DeviceCodeRequestOrigin {
  userAgent: string | null
  ip: string | null
}

/** What `/v1/device/token`'s controller needs to actually set the session cookie —
 *  the fully-serialised `Set-Cookie` value(s) better-auth's own `setSessionCookie`
 *  produced (via the device-session-cookie plugin's after-hook). Fastify specifics
 *  (the real header write) stay in the controller, mirroring every other controller
 *  in this app (e.g. AccountDeletionController). One fixed session lifetime
 *  (NexusHero dropped the session-scope choice) — the plugin's own default.
 */
export interface DeviceTokenExchangeResult {
  setCookies: string[]
}

@Injectable()
export class DeviceService {
  // Explicit tokens — see the comment on ProfileController's constructor.
  constructor(
    @Inject(BETTER_AUTH_BUNDLE) private readonly betterAuth: BetterAuthBundle,
    @Inject(DEVICE_CODE_REPOSITORY) private readonly repository: DeviceCodeRepository,
    @Inject(REGION_RESOLVER) private readonly regionResolver: RegionResolver,
  ) {}

  async requestCode(origin: DeviceCodeRequestOrigin): Promise<DeviceCodeResponseDto> {
    // Rate limiting for this endpoint is enforced at the HTTP layer by
    // `@nestjs/throttler` (device.controller.ts) — IP-keyed, 60s/10, the
    // write-amplification bound from PR #239. Nothing service-side needs to count
    // here anymore (the removed device-code-rate-limit.ts did).
    const result = await deviceAuthorizationApi(this.betterAuth.auth).deviceCode({
      body: { client_id: DEVICE_AUTHORIZATION_CLIENT_ID },
    })

    // task 0b: resolves to a country code, or UNKNOWN_REGION ("unknown", never a
    // guess) for a private/unroutable address or a stale/unconfigured database —
    // AC-3's rendered "Region unbekannt" state is this value round-tripped, not a
    // frontend-side fallback of its own.
    const region = await this.regionResolver.resolve(origin.ip)

    await this.repository.recordRequestContext(result.device_code, {
      userAgent: origin.userAgent,
      ip: origin.ip,
      region,
      requestedAt: new Date(),
    })

    return {
      userCode: result.user_code,
      deviceCode: result.device_code,
      verificationUriComplete: result.verification_uri_complete,
      expiresIn: result.expires_in,
      interval: result.interval,
    }
  }

  /**
   * `GET /v1/device/pending` (#238 task 2, AC-3). `headers` carries the *phone's*
   * cookies — forwarded into `auth.api.deviceVerify()` so the claim (binding this
   * code to the phone's own session, if any) happens entirely server-side. This is
   * the fix for the CSRF gap Musti's review found in the plugin's own `/device`
   * route: a browser never calls that claiming logic directly, only this endpoint
   * does, and only after CORS/origin checks the mounted `/api/auth/*` catch-all
   * would apply anyway — see better-auth.ts's `DEVICE_AUTHORIZATION_DISABLED_PATHS`
   * comment for the full finding.
   */
  async getPending(userCode: string, headers: Headers): Promise<DevicePendingResponseDto> {
    try {
      await deviceAuthorizationApi(this.betterAuth.auth).deviceVerify({ headers, query: { user_code: userCode } })
    } catch (error) {
      translateDeviceApiError(error)
    }

    // Read fresh from our own row rather than trusting deviceVerify's own (narrower)
    // JSON response — same table, one less thing that could disagree with itself.
    const record = await this.repository.findByUserCode(userCode)
    if (!record) {
      // deviceVerify just succeeded against this exact userCode, so this can only
      // mean a genuine race (the code expired/was consumed between the two reads) —
      // translateDeviceApiError has nothing to translate here, so this constructs
      // the equivalent 400 directly, in the plugin's own error vocabulary.
      throw new BadRequestException({ error: 'invalid_request', error_description: 'Invalid user code' })
    }

    return {
      userCode: record.userCode,
      status: record.status,
      userAgent: record.userAgent,
      region: record.region,
      requestedAt: record.requestedAt ? record.requestedAt.toISOString() : null,
    }
  }

  /**
   * `POST /v1/device/approve` (#238 task 2, AC-5). `headers` carries the *phone's*
   * cookies — the plugin's own `deviceApprove` enforces "must be a real, matching
   * account session" internally (401/403), so this never needs
   * `UserContextGuard`'s broader guest-or-account resolution at all. One-tap: no
   * session-scope choice travels with this call (NexusHero dropped it) — approving
   * is the whole action.
   */
  async approve(userCode: string, headers: Headers): Promise<void> {
    try {
      await deviceAuthorizationApi(this.betterAuth.auth).deviceApprove({ headers, body: { userCode } })
    } catch (error) {
      translateDeviceApiError(error)
    }
  }

  /**
   * `POST /v1/device/token` (#238 task 2, AC-5). `headers` carries the *desktop's*
   * headers — load-bearing for `ipAddress`/`userAgent` on the created Session row
   * (see DeviceAuthorizationApi.deviceToken's own doc comment): omit them and every
   * QR-issued session shows a blank device in the list AC-5 exists to populate.
   *
   * The plugin's own `/device/token` route returns a Bearer token in the JSON body
   * (ADR-0008/0012 forbid a browser from holding one), so the device-session-cookie
   * plugin (better-auth.ts) adds an after-hook that calls better-auth's own
   * `setSessionCookie` for this route. We dispatch with `returnHeaders: true` and
   * hand the resulting `Set-Cookie` value(s) to the controller, verbatim — the
   * signed format is better-auth's, never re-implemented here.
   */
  async exchangeToken(deviceCode: string, headers: Headers): Promise<DeviceTokenExchangeResult> {
    let result: Awaited<ReturnType<ReturnType<typeof deviceAuthorizationApi>['deviceToken']>>
    try {
      result = await deviceAuthorizationApi(this.betterAuth.auth).deviceToken({
        headers,
        body: {
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: deviceCode,
          client_id: DEVICE_AUTHORIZATION_CLIENT_ID,
        },
        returnHeaders: true,
      })
    } catch (error) {
      translateDeviceApiError(error)
    }

    const setCookies = result.headers.getSetCookie()
    if (setCookies.length === 0) {
      // The after-hook is load-bearing: without it (a better-auth bump that drops
      // `newSession`, or a plugin ordering change) there is no session cookie, and a
      // silent `{ success: true }` with no cookie would leave the desktop
      // authenticated as nothing. Fail loudly rather than mint an unusable session.
      throw new BadRequestException({ error: 'server_error', error_description: 'No session cookie was issued' })
    }

    return { setCookies }
  }
}
