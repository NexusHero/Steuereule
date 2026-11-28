// The voice route over real HTTP (guard, ValidationPipe, controller), ADR-0115.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { buildTestApp } from './support/build-test-app.js'

process.env.GUEST_SESSION_SECRET = 'http-test-secret'

describe('POST /v1/eulen-modus/stimme', () => {
  let app: NestFastifyApplication
  const before = { fake: process.env.AI_FAKE_KI, provider: process.env.AI_SPEECH_PROVIDER }

  afterEach(async () => {
    await app.close()
    for (const [name, value] of [['AI_FAKE_KI', before.fake], ['AI_SPEECH_PROVIDER', before.provider]] as const) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  async function start(voice: boolean) {
    if (voice) process.env.AI_FAKE_KI = '1'
    else delete process.env.AI_FAKE_KI
    delete process.env.AI_SPEECH_PROVIDER
    app = (await buildTestApp({ sessionsByToken: { 'tok-voice': 'user-voice' } })).app
  }

  const speak = (payload: unknown, token: string | null = 'tok-voice') =>
    app.inject({ method: 'POST', url: '/v1/eulen-modus/stimme', payload: payload as object, headers: token === null ? {} : { cookie: `better-auth.session_token=${token}` } })

  it('answers a passage as a WAV file that nothing may keep', async () => {
    await start(true)
    const response = await speak({ text: 'Rund 3.030 Euro.', language: 'de' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('audio/wav')
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.rawPayload.toString('latin1', 0, 4)).toBe('RIFF')
  })

  it('tells the app in the capabilities whether there is a voice', async () => {
    await start(true)
    expect((await app.inject({ method: 'GET', url: '/v1/capabilities' })).json()).toMatchObject({ eulenStimme: true })
    await app.close()
    await start(false)
    expect((await app.inject({ method: 'GET', url: '/v1/capabilities' })).json()).toMatchObject({ eulenStimme: false })
  })

  it('answers 503 with a sentence where no voice is set up', async () => {
    await start(false)
    const response = await speak({ text: 'Hallo.', language: 'de' })
    expect(response.statusCode).toBe(503)
    expect(response.json()).toMatchObject({ code: 'SPEECH_UNAVAILABLE' })
  })

  it('refuses a guest', async () => {
    await start(true)
    expect((await speak({ text: 'Hallo.', language: 'de' }, null)).statusCode).toBe(401)
  })

  it('refuses an empty passage, one that is too long and a language it has no voice for', async () => {
    await start(true)
    expect((await speak({ text: '', language: 'de' })).statusCode).toBe(400)
    expect((await speak({ text: 'a'.repeat(601), language: 'de' })).statusCode).toBe(400)
    expect((await speak({ text: 'Hallo.', language: 'fr' })).statusCode).toBe(400)
  })
})
