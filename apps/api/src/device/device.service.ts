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
import { Inject, Injectable } from '@nestjs/common'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from '../auth/auth.tokens.js'
import { deviceAuthorizationApi } from './device-authorization-api.js'
import { DEVICE_CODE_REPOSITORY, type DeviceCodeRepository } from './device-code.repository.js'
import type { DeviceCodeResponseDto } from './dto/device-code-response.dto.js'
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

@Injectable()
export class DeviceService {
  // Explicit tokens — see the comment on ProfileController's constructor.
  constructor(
    @Inject(BETTER_AUTH_BUNDLE) private readonly betterAuth: BetterAuthBundle,
    @Inject(DEVICE_CODE_REPOSITORY) private readonly repository: DeviceCodeRepository,
    @Inject(REGION_RESOLVER) private readonly regionResolver: RegionResolver,
  ) {}

  async requestCode(origin: DeviceCodeRequestOrigin): Promise<DeviceCodeResponseDto> {
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
}
