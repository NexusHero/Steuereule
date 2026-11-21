// ADR-0101 §20: the self-employment switch, read by the client before any year exists (09b, CI 20.11.2026).
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { buildTestApp } from './support/build-test-app.js'

process.env.GUEST_SESSION_SECRET = 'capabilities-http-test-secret'

describe('GET /v1/capabilities', () => {
  let app: NestFastifyApplication
  const before = process.env.SELBSTSTAENDIGE_ENABLED

  afterEach(async () => {
    if (before === undefined) delete process.env.SELBSTSTAENDIGE_ENABLED
    else process.env.SELBSTSTAENDIGE_ENABLED = before
    await app.close()
  })

  it('reports the switch on, without a session', async () => {
    process.env.SELBSTSTAENDIGE_ENABLED = 'true'
    ;({ app } = await buildTestApp())
    const response = await app.inject({ method: 'GET', url: '/v1/capabilities' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ selbststaendig: true })
  })

  it('reports the switch off', async () => {
    process.env.SELBSTSTAENDIGE_ENABLED = 'false'
    ;({ app } = await buildTestApp())
    const response = await app.inject({ method: 'GET', url: '/v1/capabilities' })
    expect(response.json()).toEqual({ selbststaendig: false })
  })
})
