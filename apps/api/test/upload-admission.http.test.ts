import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { buildTestApp } from './support/build-test-app.js'
import { UploadAdmission } from '../src/receipt/upload-admission.js'
import { createResettableRateLimitStorage } from '../src/auth/rate-limit-storage.js'

// ADR-0109: an upload is buffered whole, so the instance caps uploads in flight and a guest has a daily byte budget.

const boundary = '----AdmissionBoundary'
function multipart(payload: Buffer, cookie: Record<string, string> = {}) {
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.pdf"\r\nContent-Type: application/pdf\r\n\r\n`, 'utf8'),
    payload,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
  ])
  return { body, headers: { ...cookie, 'content-type': `multipart/form-data; boundary=${boundary}` } }
}
const pdf = (marker: string, pad = 0) => Buffer.concat([Buffer.from(`%PDF-1.4\n% ${marker}\n1 0 obj\n<<>>\nendobj\n`), Buffer.alloc(pad, 0x20)])

describe('UploadAdmission slots', () => {
  const bundle = { rateLimitStorage: createResettableRateLimitStorage({ redisUrl: '' }) } as never

  it('refuses an upload past the instance cap with Retry-After, and frees the slot on release', () => {
    process.env.UPLOAD_MAX_IN_FLIGHT = '2'
    try {
      const admission = new UploadAdmission(bundle)
      const a = admission.acquire('u1')
      admission.acquire('u2')
      expect(() => admission.acquire('u3')).toThrowError(expect.objectContaining({ code: 'UPLOAD_BUSY', details: { retryAfterSeconds: 3 } }))
      a()
      expect(() => admission.acquire('u3')).not.toThrow()
    } finally {
      delete process.env.UPLOAD_MAX_IN_FLIGHT
    }
  })

  it('allows one upload at a time per account or address', () => {
    const admission = new UploadAdmission(bundle)
    const release = admission.acquire('u1')
    expect(() => admission.acquire('u1')).toThrowError(expect.objectContaining({ code: 'UPLOAD_BUSY' }))
    release()
    release()
    expect(() => admission.acquire('u1')).not.toThrow()
  })
})

describe('guest upload budget over HTTP', () => {
  let app: NestFastifyApplication

  beforeEach(async () => {
    process.env.GUEST_UPLOAD_BYTES_PER_DAY = '2000'
    app = (await buildTestApp({ sessionsByToken: { 'tok-acc': 'user-acc' } })).app
  })
  afterEach(async () => {
    delete process.env.GUEST_UPLOAD_BYTES_PER_DAY
    await app.close()
  })

  it('answers 429 with Retry-After once an address has used its daily bytes, even with a fresh guest id each time', async () => {
    const first = multipart(pdf('one', 1200))
    expect((await app.inject({ method: 'POST', url: '/v1/belege/upload', headers: first.headers, payload: first.body })).statusCode).toBe(201)
    const second = multipart(pdf('two', 1200))
    const refused = await app.inject({ method: 'POST', url: '/v1/belege/upload', headers: second.headers, payload: second.body })
    expect(refused.statusCode).toBe(429)
    expect(refused.json()).toMatchObject({ code: 'GUEST_UPLOAD_LIMIT' })
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0)
  })

  it('does not apply to a signed-in account', async () => {
    for (const marker of ['a', 'b']) {
      const m = multipart(pdf(marker, 1200), { cookie: 'better-auth.session_token=tok-acc' })
      expect((await app.inject({ method: 'POST', url: '/v1/belege/upload', headers: m.headers, payload: m.body })).statusCode).toBe(201)
    }
  })
})

describe('parse daily quota over HTTP (ADR-0109)', () => {
  let app: NestFastifyApplication

  beforeEach(async () => {
    process.env.PARSE_DAILY_LIMIT = '2'
    app = (await buildTestApp({ sessionsByToken: { 'tok-parse': 'user-parse' } })).app
  })
  afterEach(async () => {
    delete process.env.PARSE_DAILY_LIMIT
    await app.close()
  })

  it('answers 429 with Retry-After once the account has used its parses of the day', async () => {
    const headers = { cookie: 'better-auth.session_token=tok-parse' }
    const parse = () => app.inject({ method: 'POST', url: '/v1/belege/parse', headers, payload: { taxYear: 2025, fileName: 'b.pdf', textSource: 'pdf_text', rawText: 'Supermarkt Kassenbon Brot Milch 7,40 EUR 12.06.2025' } })
    expect((await parse()).statusCode).toBe(200)
    expect((await parse()).statusCode).toBe(200)
    const third = await parse()
    expect(third.statusCode).toBe(429)
    expect(third.json()).toMatchObject({ code: 'PARSE_DAILY_LIMIT' })
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0)
  })
})

describe('smaller bounds (ADR-0109)', () => {
  it('refuses a name over 100 characters on PUT /v1/profile', async () => {
    const { app } = await buildTestApp()
    try {
      const res = await app.inject({ method: 'PUT', url: '/v1/profile', payload: { firstName: 'a'.repeat(101), lastName: 'Beispiel' } })
      expect(res.statusCode).toBe(400)
    } finally {
      await app.close()
    }
  })

  it('gives the Brevo call a timeout', async () => {
    const { BrevoEmailSender } = await import('../src/auth/brevo-email-sender.js')
    let signal: AbortSignal | null | undefined
    const sender = new BrevoEmailSender({ apiKey: 'k', senderEmail: 'a@b.example', senderName: 'x' }, async (_url, init) => {
      signal = init.signal
      return { ok: true, status: 201 }
    })
    await sender.sendVerificationEmail({ to: 'x@y.example', subject: 's', url: 'https://u.example', token: 't' })
    expect(signal).toBeInstanceOf(AbortSignal)
  })
})
