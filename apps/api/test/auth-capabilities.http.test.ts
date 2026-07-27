// REQ-008 — the capability probe, driven over real HTTP via light-my-request.
//
// This endpoint exists so the login screen can be honest: social sign-in only works where
// the operator configured the provider, and the client cannot see server-side credentials.
// The two cases that matter are "configured" and "not configured" — the second is the one
// that used to render a Google button whose every press ended in "provider not found".
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { buildTestApp } from './support/build-test-app.js'

process.env.GUEST_SESSION_SECRET = 'auth-capabilities-http-test-secret'

describe('GET /v1/auth/capabilities', () => {
  let app: NestFastifyApplication

  afterEach(async () => {
    await app.close()
  })

  it('reports google as available when the test environment has the credentials', async () => {
    ;({ app } = await buildTestApp())

    const response = await app.inject({ method: 'GET', url: '/v1/auth/capabilities' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ socialProviders: ['google'] })
  })

  it('is reachable without a session — the login screen must ask before one exists', async () => {
    ;({ app } = await buildTestApp())

    // No cookie of any kind on this request.
    const response = await app.inject({ method: 'GET', url: '/v1/auth/capabilities' })

    expect(response.statusCode).toBe(200)
  })

  it('never leaks the credentials themselves — only capability names', async () => {
    ;({ app } = await buildTestApp())

    const body = JSON.stringify(await app.inject({ method: 'GET', url: '/v1/auth/capabilities' }).then((r) => r.json()))

    expect(body.toLowerCase()).not.toContain('secret')
    expect(body.toLowerCase()).not.toContain('client-id')
    expect(body.toLowerCase()).not.toContain('clientid')
    // The dev-only placeholder values the test env resolves to must not appear either.
    expect(body).not.toContain('dev-only-google-client-id')
    expect(body).not.toContain('dev-only-google-client-secret')
  })
})
