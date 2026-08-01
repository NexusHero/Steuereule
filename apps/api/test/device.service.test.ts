// DeviceService's own logic in isolation (#238, tasks 0 + 2) — request/response
// mapping and header forwarding. This deliberately does NOT re-implement RFC 8628 in
// a fake (that would be reimplementing better-auth's own plugin, the opposite of
// ADR-0004's "no mocking into meaninglessness") — it stubs the plugin calls
// DeviceService makes with canned, realistic payloads and asserts DeviceService
// handles them correctly. The real protocol mechanics (code generation, expiry,
// session creation, cookie round-trip through the *real* better-auth instance) are
// proven against real Postgres in
// test/acceptance/req-014-device-code.integration.test.ts and
// req-014-device-approve-token.integration.test.ts.
//
// No session-scope choice anywhere below — NexusHero dropped the "just for now" vs
// "trust this device" distinction (one-tap approval, one fixed session lifetime).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BetterAuthBundle } from '../src/auth/auth.tokens.js'
import { resolveBetterAuthSecret } from '../src/auth/better-auth.js'
import { DEVICE_AUTHORIZATION_CLIENT_ID, DeviceService } from '../src/device/device.service.js'
import type { RegionResolver } from '../src/device/region/region-resolver.js'
import { signBetterAuthCookieValue } from '../src/device/session-cookie.js'
import { FakeDeviceCodeRepository } from './fakes/fake-device-code.repository.js'
import { APIError } from 'better-auth'

function fakeBundle(api: Record<string, ReturnType<typeof vi.fn>>): BetterAuthBundle {
  return {
    auth: { api } as unknown as BetterAuthBundle['auth'],
    sessionCookieName: 'test-session',
    enabledSocialProviders: [],
    sessionExpiresInSeconds: 604800,
  }
}

/** A PrismaService-shaped stub whose `rateLimit.updateMany` always reports "still
 *  under the max" — every call is allowed, unconditionally. DeviceService's own
 *  rate-limit consult (`consumeDevicePendingRateLimit`) is exercised for real,
 *  against real Postgres, in test/db-rate-limit.integration.test.ts and the
 *  req-014 acceptance suites; this fake exists only so getPending's *other* logic
 *  can be unit-tested without a live database. */
function fakeAllowingPrisma() {
  return { rateLimit: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } } as never
}

const CANNED_CODE_RESULT = {
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
    repository.seedKnownDeviceCode(CANNED_CODE_RESULT.device_code)
    deviceCode = vi.fn().mockResolvedValue(CANNED_CODE_RESULT)
    resolve = vi.fn().mockResolvedValue('DE')
    regionResolver = { resolve }
    service = new DeviceService(fakeBundle({ deviceCode }), repository, regionResolver, fakeAllowingPrisma())
  })

  it('calls the plugin with this app\'s fixed client_id, never a caller-supplied one', async () => {
    await service.requestCode({ userAgent: 'Mozilla/5.0', ip: '203.0.113.5' })
    expect(deviceCode).toHaveBeenCalledWith({ body: { client_id: DEVICE_AUTHORIZATION_CLIENT_ID } })
  })

  it('maps the plugin\'s snake_case result onto the response DTO', async () => {
    await expect(service.requestCode({ userAgent: 'Mozilla/5.0', ip: '203.0.113.5' })).resolves.toEqual({
      userCode: CANNED_CODE_RESULT.user_code,
      deviceCode: CANNED_CODE_RESULT.device_code,
      verificationUriComplete: CANNED_CODE_RESULT.verification_uri_complete,
      expiresIn: CANNED_CODE_RESULT.expires_in,
      interval: CANNED_CODE_RESULT.interval,
    })
  })

  it('stamps the desktop\'s own User-Agent/IP/resolved-region onto the row the plugin just created, keyed by device_code', async () => {
    await service.requestCode({ userAgent: 'Mozilla/5.0 TestAgent', ip: '203.0.113.5' })
    expect(repository.calls).toHaveLength(1)
    expect(repository.calls[0]!.deviceCode).toBe(CANNED_CODE_RESULT.device_code)
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

describe('DeviceService.getPending (#238 task 2, AC-3 — match-verification)', () => {
  let repository: FakeDeviceCodeRepository
  let deviceVerify: ReturnType<typeof vi.fn>
  let service: DeviceService
  const phoneHeaders = new Headers({ cookie: 'better-auth.session_token=abc' })

  beforeEach(() => {
    repository = new FakeDeviceCodeRepository()
    repository.seedRow({
      deviceCode: 'dev-1',
      userCode: 'USER1',
      status: 'pending',
      requestUserAgent: 'Mozilla/5.0 Desktop',
      requestRegion: 'DE',
      requestedAt: new Date('2026-08-01T10:00:00.000Z'),
    })
    deviceVerify = vi.fn().mockResolvedValue({ user_code: 'USER1', status: 'pending' })
    service = new DeviceService(fakeBundle({ deviceVerify }), repository, { resolve: vi.fn() }, fakeAllowingPrisma())
  })

  it('claims the code server-side by forwarding the caller\'s (the phone\'s) headers into deviceVerify — never a browser-direct claim', async () => {
    await service.getPending('USER1', phoneHeaders, '203.0.113.5')
    expect(deviceVerify).toHaveBeenCalledWith({ headers: phoneHeaders, query: { user_code: 'USER1' } })
  })

  it('returns the actual stored browser/region/time, read fresh from the row, not the plugin\'s narrower response', async () => {
    await expect(service.getPending('USER1', phoneHeaders, '203.0.113.5')).resolves.toEqual({
      userCode: 'USER1',
      status: 'pending',
      userAgent: 'Mozilla/5.0 Desktop',
      region: 'DE',
      requestedAt: '2026-08-01T10:00:00.000Z',
    })
  })

  it('two different requests render two different payloads (AC-3: never hard-coded)', async () => {
    repository.seedRow({
      deviceCode: 'dev-2',
      userCode: 'USER2',
      status: 'pending',
      requestUserAgent: 'Mozilla/5.0 OtherAgent',
      requestRegion: 'FR',
      requestedAt: new Date('2026-08-01T11:00:00.000Z'),
    })
    deviceVerify.mockResolvedValue({ user_code: 'USER2', status: 'pending' })
    const first = await service.getPending('USER1', phoneHeaders, '203.0.113.5')
    const second = await service.getPending('USER2', phoneHeaders, '203.0.113.5')
    expect(first.userAgent).not.toBe(second.userAgent)
    expect(first.region).not.toBe(second.region)
  })

  it('translates a plugin APIError (e.g. invalid/expired code) into the equivalent HttpException, same status/body', async () => {
    deviceVerify.mockRejectedValue(new APIError('BAD_REQUEST', { error: 'invalid_request', error_description: 'Invalid user code' }))
    await expect(service.getPending('BOGUS', phoneHeaders, '203.0.113.5')).rejects.toMatchObject({
      status: 400,
      response: { error: 'invalid_request', error_description: 'Invalid user code' },
    })
  })
})

describe('DeviceService.approve (#238 task 2, AC-5 — one tap, no scope choice)', () => {
  let repository: FakeDeviceCodeRepository
  let deviceApprove: ReturnType<typeof vi.fn>
  let service: DeviceService
  const phoneHeaders = new Headers({ cookie: 'better-auth.session_token=abc' })

  beforeEach(() => {
    repository = new FakeDeviceCodeRepository()
    repository.seedRow({ deviceCode: 'dev-1', userCode: 'USER1', status: 'pending' })
    deviceApprove = vi.fn().mockResolvedValue({ success: true })
    service = new DeviceService(fakeBundle({ deviceApprove }), repository, { resolve: vi.fn() }, fakeAllowingPrisma())
  })

  it('forwards the phone\'s headers into deviceApprove — the plugin itself enforces "must be a real, matching session"', async () => {
    await service.approve('USER1', phoneHeaders)
    expect(deviceApprove).toHaveBeenCalledWith({ headers: phoneHeaders, body: { userCode: 'USER1' } })
  })

  it('translates a plugin APIError (e.g. wrong account) into the equivalent HttpException, same status/body', async () => {
    deviceApprove.mockRejectedValue(new APIError('FORBIDDEN', { error: 'access_denied', error_description: 'not yours' }))
    await expect(service.approve('USER1', phoneHeaders)).rejects.toMatchObject({
      status: 403,
      response: { error: 'access_denied', error_description: 'not yours' },
    })
  })
})

describe('DeviceService.exchangeToken (#238 task 2, AC-5)', () => {
  const desktopHeaders = new Headers({ 'user-agent': 'DesktopBrowser/1.0' })
  const CANNED_TOKEN_RESULT = { access_token: 'the-session-token', token_type: 'Bearer', expires_in: 604800, scope: '' }

  function setUp() {
    const repository = new FakeDeviceCodeRepository()
    repository.seedRow({ deviceCode: 'dev-1', userCode: 'USER1', status: 'approved' })
    const deviceToken = vi.fn().mockResolvedValue(CANNED_TOKEN_RESULT)
    const service = new DeviceService(fakeBundle({ deviceToken }), repository, { resolve: vi.fn() }, fakeAllowingPrisma())
    return { repository, deviceToken, service }
  }

  it('forwards the desktop\'s own headers into deviceToken — load-bearing for ipAddress/userAgent on the created session', async () => {
    const { deviceToken, service } = setUp()
    await service.exchangeToken('dev-1', desktopHeaders)
    expect(deviceToken).toHaveBeenCalledWith({
      headers: desktopHeaders,
      body: { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: 'dev-1', client_id: DEVICE_AUTHORIZATION_CLIENT_ID },
    })
  })

  it('signs the cookie value in better-auth\'s own wire format, with the resolved secret', async () => {
    const { service } = setUp()
    const result = await service.exchangeToken('dev-1', desktopHeaders)
    expect(result.cookieValue).toBe(signBetterAuthCookieValue('the-session-token', resolveBetterAuthSecret()))
  })

  it('returns the bundle\'s real session cookie name, never a hard-coded string', async () => {
    const { service } = setUp()
    const result = await service.exchangeToken('dev-1', desktopHeaders)
    expect(result.cookieName).toBe('test-session')
  })

  it('carries the bundle\'s configured session lifetime as maxAge — one fixed lifetime, no scope choice', async () => {
    const { service } = setUp()
    const result = await service.exchangeToken('dev-1', desktopHeaders)
    expect(result.maxAge).toBe(604800)
  })

  it('translates a plugin APIError (e.g. still pending) into the equivalent HttpException, same status/body', async () => {
    const { deviceToken, service } = setUp()
    deviceToken.mockRejectedValue(new APIError('BAD_REQUEST', { error: 'authorization_pending', error_description: 'not yet approved' }))
    await expect(service.exchangeToken('dev-1', desktopHeaders)).rejects.toMatchObject({
      status: 400,
      response: { error: 'authorization_pending', error_description: 'not yet approved' },
    })
  })
})
