// The voice route over real HTTP (guard, ValidationPipe, controller), ADR-0115.
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { FAKE_HEARD_TEXT } from '../src/speech/fake-speech.js'
import { wavFromPcm } from '../src/speech/wav.js'
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

  describe('POST /v1/eulen-modus/gehoert', () => {
    const COOKIE = { cookie: 'better-auth.session_token=tok-voice' }
    // Half a second of a square wave: loud enough to be heard as sound.
    const sound = wavFromPcm(Buffer.from(Int16Array.from({ length: 8_000 }, (_, i) => (Math.floor(i / 40) % 2 === 0 ? 6_000 : -6_000)).buffer), 16_000)

    function form(parts: Array<{ name: string; value: string } | { name: 'file'; file: Buffer }>) {
      const boundary = '----SteuereuleSpeechBoundary'
      const chunks = parts.flatMap((part) =>
        'file' in part
          ? [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="aufnahme.wav"\r\nContent-Type: audio/wav\r\n\r\n`), part.file, Buffer.from('\r\n')]
          : [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value}\r\n`)],
      )
      return { payload: Buffer.concat([...chunks, Buffer.from(`--${boundary}--\r\n`)]), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } }
    }

    const hear = (parts: Parameters<typeof form>[0], signedIn = true) => {
      const { payload, headers } = form(parts)
      return app.inject({ method: 'POST', url: '/v1/eulen-modus/gehoert', payload, headers: { ...headers, ...(signedIn ? COOKIE : {}) } })
    }

    it('answers the words of a recording, and nothing may keep them', async () => {
      await start(true)
      const response = await hear([{ name: 'language', value: 'de' }, { name: 'file', file: sound }])
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ text: FAKE_HEARD_TEXT })
      expect(response.headers['cache-control']).toBe('no-store')
    })

    it('answers an empty text for silence', async () => {
      await start(true)
      const response = await hear([{ name: 'language', value: 'de' }, { name: 'file', file: wavFromPcm(Buffer.alloc(3_200), 16_000) }])
      expect(response.json()).toEqual({ text: '' })
    })

    it('refuses a guest, a body that is no form, a form without a recording and a file that is no WAV', async () => {
      await start(true)
      expect((await hear([{ name: 'language', value: 'de' }, { name: 'file', file: sound }], false)).statusCode).toBe(401)
      expect((await app.inject({ method: 'POST', url: '/v1/eulen-modus/gehoert', payload: { language: 'de' }, headers: COOKIE })).json()).toMatchObject({ code: 'SPEECH_MULTIPART_REQUIRED' })
      expect((await hear([{ name: 'language', value: 'de' }])).json()).toMatchObject({ code: 'SPEECH_FILE_MISSING' })
      expect((await hear([{ name: 'language', value: 'de' }, { name: 'file', file: Buffer.from('ID3 not a wav file at all, but long enough to be checked for a header') }])).json()).toMatchObject({ code: 'SPEECH_FILE_NOT_WAV' })
    })

    it('refuses a language it cannot hear, and one that is missing', async () => {
      await start(true)
      expect((await hear([{ name: 'language', value: 'fr' }, { name: 'file', file: sound }])).json()).toMatchObject({ code: 'SPEECH_LANGUAGE_INVALID' })
      expect((await hear([{ name: 'file', file: sound }])).statusCode).toBe(400)
    })

    it('answers 413 for a recording longer than a minute', async () => {
      await start(true)
      const response = await hear([{ name: 'language', value: 'de' }, { name: 'file', file: wavFromPcm(Buffer.alloc(2 * 1024 * 1024, 1), 16_000) }])
      expect(response.statusCode).toBe(413)
      expect(response.json()).toMatchObject({ code: 'SPEECH_FILE_TOO_LONG' })
    })

    it('answers 503 where no voice is set up', async () => {
      await start(false)
      const response = await hear([{ name: 'language', value: 'de' }, { name: 'file', file: sound }])
      expect(response.statusCode).toBe(503)
      expect(response.json()).toMatchObject({ code: 'SPEECH_UNAVAILABLE' })
    })
  })
})
