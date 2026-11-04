import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from '../auth/auth.tokens.js'
import { deviceAuthorizationApi } from './device-authorization-api.js'
import { translateDeviceApiError } from './device-api-error.js'
import { DEVICE_CODE_REPOSITORY, type DeviceCodeRepository } from './device-code.repository.js'
import type { DeviceCodeResponseDto } from './dto/device-code-response.dto.js'
import type { DevicePendingResponseDto } from './dto/device-pending-response.dto.js'
import { REGION_RESOLVER, type RegionResolver } from './region/region-resolver.js'

export const DEVICE_AUTHORIZATION_CLIENT_ID = 'steuereule-web'

export interface DeviceCodeRequestOrigin {
  userAgent: string | null
  ip: string | null
}

/** What `/v1/device/token`'s controller needs to actually set the session cookie. */
export interface DeviceTokenExchangeResult {
  setCookies: string[]
}

/** The `/v1/device/code` application logic. */
@Injectable()
export class DeviceService {
  constructor(
    @Inject(BETTER_AUTH_BUNDLE) private readonly betterAuth: BetterAuthBundle,
    @Inject(DEVICE_CODE_REPOSITORY) private readonly repository: DeviceCodeRepository,
    @Inject(REGION_RESOLVER) private readonly regionResolver: RegionResolver,
  ) {}

  async requestCode(origin: DeviceCodeRequestOrigin): Promise<DeviceCodeResponseDto> {
    const result = await deviceAuthorizationApi(this.betterAuth.auth).deviceCode({
      body: { client_id: DEVICE_AUTHORIZATION_CLIENT_ID },
    })

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

  async getPending(userCode: string, headers: Headers): Promise<DevicePendingResponseDto> {
    try {
      await deviceAuthorizationApi(this.betterAuth.auth).deviceVerify({ headers, query: { user_code: userCode } })
    } catch (error) {
      translateDeviceApiError(error)
    }

    const record = await this.repository.findByUserCode(userCode)
    if (!record) {
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

  async approve(userCode: string, headers: Headers): Promise<void> {
    try {
      await deviceAuthorizationApi(this.betterAuth.auth).deviceApprove({ headers, body: { userCode } })
    } catch (error) {
      translateDeviceApiError(error)
    }
  }

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
      throw new BadRequestException({ error: 'server_error', error_description: 'No session cookie was issued' })
    }

    return { setCookies }
  }
}
