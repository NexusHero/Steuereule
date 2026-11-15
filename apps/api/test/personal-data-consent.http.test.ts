// ADR-0091 over real HTTP: the consent that personal data may go to the owl's model.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { OWL_PERSONAL_DATA_CONSENT_VERSION } from '@steuereule/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from './support/build-test-app.js'

const URL = '/v1/eulen-modus/personendaten-einwilligung'
const cookie = 'better-auth.session_token=tok-consent'

describe('GET/PUT /v1/eulen-modus/personendaten-einwilligung', () => {
  let app: NestFastifyApplication

  beforeEach(async () => {
    app = (await buildTestApp({ sessionsByToken: { 'tok-consent': 'user-consent' } })).app
  })

  afterEach(async () => {
    await app.close()
  })

  it('needs an account', async () => {
    expect((await app.inject({ method: 'GET', url: URL })).statusCode).toBe(401)
  })

  it('starts without consent, records it, and takes it back', async () => {
    const before = await app.inject({ method: 'GET', url: URL, headers: { cookie } })
    expect(before.json()).toEqual({ granted: false, version: OWL_PERSONAL_DATA_CONSENT_VERSION, grantedAt: null })

    const granted = await app.inject({ method: 'PUT', url: URL, headers: { cookie }, payload: { granted: true } })
    expect(granted.statusCode).toBe(200)
    expect(granted.json()).toMatchObject({ granted: true, version: OWL_PERSONAL_DATA_CONSENT_VERSION })

    const revoked = await app.inject({ method: 'PUT', url: URL, headers: { cookie }, payload: { granted: false } })
    expect(revoked.json()).toMatchObject({ granted: false, grantedAt: null })
  })

  it('refuses a body that is not a decision', async () => {
    const response = await app.inject({ method: 'PUT', url: URL, headers: { cookie }, payload: { granted: 'ja' } })
    expect(response.statusCode).toBe(400)
  })
})
