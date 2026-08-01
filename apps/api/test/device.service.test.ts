// DeviceService's own logic in isolation (#238, task 0) — the request/response
// mapping and the request-context write. This deliberately does NOT re-implement
// RFC 8628 in a fake (that would be reimplementing better-auth's own plugin, the
// opposite of ADR-0004's "no mocking into meaninglessness") — it stubs the one call
// DeviceService makes (`auth.api.deviceCode`) with a canned, realistic payload and
// asserts DeviceService handles the result correctly. The real protocol mechanics
// (code generation, expiry) are proven against real Postgres in
// test/acceptance/req-014-device-code.integration.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BetterAuthBundle } from '../src/auth/auth.tokens.js'
import { DEVICE_AUTHORIZATION_CLIENT_ID, DeviceService } from '../src/device/device.service.js'
import type { RegionResolver } from '../src/device/region/region-resolver.js'
import { FakeDeviceCodeRepository } from './fakes/fake-device-code.repository.js'

function fakeBundle(deviceCode: ReturnType<typeof vi.fn>): BetterAuthBundle {
  return {
    auth: { api: { deviceCode } } as unknown as BetterAuthBundle['auth'],
    sessionCookieName: 'test-session',
    enabledSocialProviders: [],
  }
}

const CANNED_RESULT = {
  device_code: 'a-device-code',
  user_code: 'K7QX-9F2M',
  verification_uri: 'https://app.example.com/device',
  verification_uri_complete: 'https://app.example.com/device?user_code=K7QX-9F2M',
  expires_in: 120,
  interval: 5,
}

describe('DeviceService.requestCode', () => {
  let repository: FakeDeviceCodeRepository
  let deviceCode: ReturnType<typeof vi.fn>
  let regionResolver: RegionResolver
  let resolve: ReturnType<typeof vi.fn>
  let service: DeviceService

  beforeEach(() => {
    repository = new FakeDeviceCodeRepository()
    repository.seedKnownDeviceCode(CANNED_RESULT.device_code)
    deviceCode = vi.fn().mockResolvedValue(CANNED_RESULT)
    resolve = vi.fn().mockResolvedValue('DE')
    regionResolver = { resolve }
    service = new DeviceService(fakeBundle(deviceCode), repository, regionResolver)
  })

  it('calls the plugin with this app\'s fixed client_id, never a caller-supplied one', async () => {
    await service.requestCode({ userAgent: 'Mozilla/5.0', ip: '203.0.113.5' })
    expect(deviceCode).toHaveBeenCalledWith({ body: { client_id: DEVICE_AUTHORIZATION_CLIENT_ID } })
  })

  it('maps the plugin\'s snake_case result onto the response DTO', async () => {
    await expect(service.requestCode({ userAgent: 'Mozilla/5.0', ip: '203.0.113.5' })).resolves.toEqual({
      userCode: CANNED_RESULT.user_code,
      deviceCode: CANNED_RESULT.device_code,
      verificationUriComplete: CANNED_RESULT.verification_uri_complete,
      expiresIn: CANNED_RESULT.expires_in,
      interval: CANNED_RESULT.interval,
    })
  })

  it('stamps the desktop\'s own User-Agent/IP/resolved-region onto the row the plugin just created, keyed by device_code', async () => {
    await service.requestCode({ userAgent: 'Mozilla/5.0 TestAgent', ip: '203.0.113.5' })
    expect(repository.calls).toHaveLength(1)
    expect(repository.calls[0]!.deviceCode).toBe(CANNED_RESULT.device_code)
    expect(repository.calls[0]!.context).toMatchObject({
      userAgent: 'Mozilla/5.0 TestAgent',
      ip: '203.0.113.5',
      region: 'DE',
    })
    expect(repository.calls[0]!.context.requestedAt).toBeInstanceOf(Date)
  })

  it('resolves the region from the desktop\'s own IP, not the plugin\'s response', async () => {
    await service.requestCode({ userAgent: 'Mozilla/5.0', ip: '203.0.113.5' })
    expect(resolve).toHaveBeenCalledWith('203.0.113.5')
  })

  it('passes through a missing User-Agent/IP as null rather than inventing a placeholder', async () => {
    resolve.mockResolvedValue('unknown')
    await service.requestCode({ userAgent: null, ip: null })
    expect(resolve).toHaveBeenCalledWith(null)
    expect(repository.calls[0]!.context).toMatchObject({ userAgent: null, ip: null, region: 'unknown' })
  })
})
