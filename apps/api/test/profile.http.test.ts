// Full-stack (guard + ValidationPipe + controller) tests against the fake repository,
// driven over real HTTP via light-my-request — no live Postgres required. Complements
// profile.service.test.ts (pure service logic) by proving the wiring: 400s carry a
// machine-readable body and persist nothing, and userId scoping genuinely flows from
// the guard-set cookie, never from anything in the request body/query.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp, extractSessionCookie } from './support/build-test-app.js'
import type { FakeProfileRepository } from './fakes/fake-profile.repository.js'

process.env.GUEST_SESSION_SECRET = 'http-test-secret'

const VALID_PAYLOAD = {
  firstName: 'Anna',
  lastName: 'Beispiel',
  steuerId: '02476291358',
  steuernummer: '18181508155',
}

describe('GET/PUT /v1/profile', () => {
  let app: NestFastifyApplication
  let repository: FakeProfileRepository

  beforeEach(async () => {
    const built = await buildTestApp()
    app = built.app
    repository = built.repository
  })

  afterEach(async () => {
    await app.close()
  })

  it('GET with no cookie and no saved profile returns 200 with an all-null default, never an error', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/profile' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      firstName: null,
      lastName: null,
      steuerId: null,
      steuernummer: null,
    })
  })

  it('PUT with a valid payload returns 200 with the saved profile, then GET read-your-writes', async () => {
    const putResponse = await app.inject({ method: 'PUT', url: '/v1/profile', payload: VALID_PAYLOAD })
    expect(putResponse.statusCode).toBe(200)
    expect(putResponse.json()).toEqual(VALID_PAYLOAD)

    const sessionCookie = extractSessionCookie(putResponse.headers['set-cookie'])
    expect(sessionCookie).toBeDefined()

    const getResponse = await app.inject({
      method: 'GET',
      url: '/v1/profile',
      headers: { cookie: sessionCookie! },
    })
    expect(getResponse.statusCode).toBe(200)
    expect(getResponse.json()).toEqual(VALID_PAYLOAD)
  })

  it('PUT twice with the same payload is idempotent (same stored state, one row)', async () => {
    const first = await app.inject({ method: 'PUT', url: '/v1/profile', payload: VALID_PAYLOAD })
    const cookie = extractSessionCookie(first.headers['set-cookie'])!

    const second = await app.inject({
      method: 'PUT',
      url: '/v1/profile',
      payload: VALID_PAYLOAD,
      headers: { cookie },
    })

    expect(second.statusCode).toBe(200)
    expect(second.json()).toEqual(first.json())
    expect(repository.userCount()).toBe(1)
  })

  it('rejects a 10-digit steuerId with 400 and a machine-readable error, persisting nothing', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/profile',
      payload: { ...VALID_PAYLOAD, steuerId: '1234567890' },
    })

    expect(response.statusCode).toBe(400)
    const body = response.json() as { statusCode: number; error: string; fields: { field: string }[] }
    expect(body.statusCode).toBe(400)
    expect(body.fields.some((fieldError) => fieldError.field === 'steuerId')).toBe(true)
    expect(repository.userCount()).toBe(0)
  })

  it('rejects an empty first name with 400, persisting nothing', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/profile',
      payload: { ...VALID_PAYLOAD, firstName: '' },
    })

    expect(response.statusCode).toBe(400)
    const body = response.json() as { fields: { field: string }[] }
    expect(body.fields.some((fieldError) => fieldError.field === 'firstName')).toBe(true)
    expect(repository.userCount()).toBe(0)
  })

  it('rejects a whitespace-only last name with 400, persisting nothing', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/profile',
      payload: { ...VALID_PAYLOAD, lastName: '   ' },
    })

    expect(response.statusCode).toBe(400)
    expect(repository.userCount()).toBe(0)
  })

  it('rejects a 14-digit steuernummer with 400, persisting nothing', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/profile',
      payload: { ...VALID_PAYLOAD, steuernummer: '12345678901234' },
    })

    expect(response.statusCode).toBe(400)
    expect(repository.userCount()).toBe(0)
  })

  it('accepts a payload with no steuernummer at all (optional field)', async () => {
    const { steuernummer: _steuernummer, ...withoutSteuernummer } = VALID_PAYLOAD
    const response = await app.inject({ method: 'PUT', url: '/v1/profile', payload: withoutSteuernummer })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ...withoutSteuernummer, steuernummer: null })
  })

  it('ignores a userId supplied in the request body — scoping only ever comes from the guard', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/profile',
      payload: { ...VALID_PAYLOAD, userId: 'attacker-chosen-user-id' },
    })

    // forbidNonWhitelisted rejects unknown properties outright — proof the DTO has
    // no userId field for a client to smuggle a value through.
    expect(response.statusCode).toBe(400)
  })

  it('strictly scopes per userId: a second caller (no cookie) never sees the first caller’s profile', async () => {
    const userAPut = await app.inject({ method: 'PUT', url: '/v1/profile', payload: VALID_PAYLOAD })
    expect(userAPut.statusCode).toBe(200)

    // A fresh request with no cookie is a brand-new guest session per the guard.
    const userBGet = await app.inject({ method: 'GET', url: '/v1/profile' })
    expect(userBGet.statusCode).toBe(200)
    expect(userBGet.json()).toEqual({
      firstName: null,
      lastName: null,
      steuerId: null,
      steuernummer: null,
    })
  })

  it('strictly scopes per userId: a second caller PUTting does not overwrite the first caller', async () => {
    const userAPut = await app.inject({ method: 'PUT', url: '/v1/profile', payload: VALID_PAYLOAD })
    const userACookie = extractSessionCookie(userAPut.headers['set-cookie'])!

    const userBPayload = { ...VALID_PAYLOAD, firstName: 'Jonas', steuerId: '65929970489' }
    await app.inject({ method: 'PUT', url: '/v1/profile', payload: userBPayload })

    const userAGet = await app.inject({
      method: 'GET',
      url: '/v1/profile',
      headers: { cookie: userACookie },
    })
    expect(userAGet.json()).toEqual(VALID_PAYLOAD)
    expect(repository.userCount()).toBe(2)
  })
})
