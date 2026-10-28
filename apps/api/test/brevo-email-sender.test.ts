// #83 — the production EmailSender and its fail-closed configuration.
import { describe, expect, it } from 'vitest'
import { BREVO_SEND_URL, BrevoEmailSender, resolveBrevoConfig } from '../src/auth/brevo-email-sender.js'

const config = { apiKey: 'xkeysib-test', senderEmail: 'hallo@steuereule.de', senderName: 'SteuerEule' }
const email = {
  to: 'nutzer@example.de',
  subject: 'Bitte bestätige deine E-Mail-Adresse — SteuerEule',
  url: 'https://api.steuereule.de/api/auth/verify-email?token=abc&callbackURL=/',
  token: 'abc',
}

function recordingFetch(status = 201) {
  const calls: { url: string; init: RequestInit }[] = []
  const impl = (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return Promise.resolve({ ok: status >= 200 && status < 300, status })
  }
  return { calls, impl }
}

describe('BrevoEmailSender', () => {
  it('sends the real link through Brevo’s transactional endpoint with the API key header', async () => {
    const { calls, impl } = recordingFetch()
    await new BrevoEmailSender(config, impl).sendVerificationEmail(email)

    expect(calls).toHaveLength(1)
    const [call] = calls
    expect(call!.url).toBe(BREVO_SEND_URL)
    expect((call!.init.headers as Record<string, string>)['api-key']).toBe('xkeysib-test')
    const body = JSON.parse(String(call!.init.body))
    expect(body.to).toEqual([{ email: 'nutzer@example.de' }])
    expect(body.sender).toEqual({ email: 'hallo@steuereule.de', name: 'SteuerEule' })
    expect(body.subject).toBe(email.subject)
    expect(body.textContent).toContain(email.url)
    // The URL's `&` must be escaped inside the href, or the HTML is malformed.
    expect(body.htmlContent).toContain('token=abc&amp;callbackURL=/')
  })

  it('throws on a rejected delivery, naming the status but never the recipient', async () => {
    const { impl } = recordingFetch(401)
    const error = await new BrevoEmailSender(config, impl).sendPasswordResetEmail(email).then(
      () => new Error('expected a rejection'),
      (caught: unknown) => caught as Error,
    )
    expect(error.message).toMatch(/HTTP 401/)
    expect(error.message).not.toContain('nutzer@example.de')
  })
})

describe('resolveBrevoConfig', () => {
  it('returns the config when key and sender are set', () => {
    expect(resolveBrevoConfig({ BREVO_API_KEY: 'k', EMAIL_FROM: 'a@b.de' })).toEqual({
      apiKey: 'k',
      senderEmail: 'a@b.de',
      senderName: 'SteuerEule',
    })
  })

  it('falls back to the logging sender outside production', () => {
    expect(resolveBrevoConfig({ NODE_ENV: 'development' })).toBeUndefined()
  })

  it('refuses to boot in production without a provider', () => {
    expect(() => resolveBrevoConfig({ NODE_ENV: 'production' })).toThrow(/must be set in production/)
  })

  it('accepts an explicit EMAIL_DELIVERY=log in production (local prod-shaped stack)', () => {
    expect(resolveBrevoConfig({ NODE_ENV: 'production', EMAIL_DELIVERY: 'log' })).toBeUndefined()
  })

  it('refuses a half configuration in any environment', () => {
    expect(() => resolveBrevoConfig({ BREVO_API_KEY: 'k' })).toThrow(/set together/)
  })
})
