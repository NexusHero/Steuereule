import { describe, expect, it, vi } from 'vitest'
import { resolveBrevoConfig } from '../src/auth/brevo-email-sender.js'
import { resolveSmtpConfig, SmtpEmailSender, smtpTransportOptions } from '../src/auth/smtp-email-sender.js'

const config = { url: 'smtp://mailpit:1025', senderEmail: 'noreply@steuereule.localhost', senderName: 'SteuerEule', localRun: true }
const email = {
  to: 'nutzer@example.de',
  subject: 'Bitte bestätige deine E-Mail-Adresse — SteuerEule',
  url: 'http://localhost:3000/api/auth/verify-email?token=abc&callbackURL=http%3A%2F%2Flocalhost%3A8080%2F',
  token: 'abc',
}

function recordingTransport() {
  return { sendMail: vi.fn().mockResolvedValue({}) }
}

describe('SmtpEmailSender', () => {
  it('sends the verification link as text and as an escaped HTML link', async () => {
    const transport = recordingTransport()

    await new SmtpEmailSender(config, transport).sendVerificationEmail(email)

    expect(transport.sendMail).toHaveBeenCalledOnce()
    const message = transport.sendMail.mock.calls[0]![0]
    expect(message).toMatchObject({
      from: { address: 'noreply@steuereule.localhost', name: 'SteuerEule' },
      to: 'nutzer@example.de',
      subject: email.subject,
    })
    expect(message.text).toContain(email.url)
    expect(message.html).toContain('token=abc&amp;callbackURL=')
  })

  it('sends the password-reset link with its own call to action', async () => {
    const transport = recordingTransport()

    await new SmtpEmailSender(config, transport).sendPasswordResetEmail(email)

    expect(transport.sendMail.mock.calls[0]![0].text).toContain('Neues Passwort festlegen')
  })
})

describe('resolveSmtpConfig', () => {
  it('is off unless EMAIL_DELIVERY is smtp', () => {
    const result = resolveSmtpConfig({ SMTP_URL: 'smtp://mailpit:1025' })

    expect(result).toBeUndefined()
  })

  it('uses SMTP_URL and a local default sender', () => {
    const result = resolveSmtpConfig({ EMAIL_DELIVERY: 'smtp', SMTP_URL: 'smtp://mailpit:1025' })

    expect(result).toEqual({ url: 'smtp://mailpit:1025', senderEmail: 'noreply@steuereule.localhost', senderName: 'SteuerEule', localRun: true })
  })

  it('takes the sender from EMAIL_FROM when set', () => {
    const result = resolveSmtpConfig({ EMAIL_DELIVERY: 'smtp', SMTP_URL: 'smtp://mailpit:1025', EMAIL_FROM: 'a@b.de' })

    expect(result?.senderEmail).toBe('a@b.de')
  })

  it('is a local run only in development, tests or the local production-shaped stack', () => {
    const smtp = { EMAIL_DELIVERY: 'smtp', SMTP_URL: 'smtps://mail.example.de' }
    expect(resolveSmtpConfig({ ...smtp, NODE_ENV: 'test' })?.localRun).toBe(true)
    expect(resolveSmtpConfig({ ...smtp, NODE_ENV: 'production', BETTER_AUTH_URL: 'http://localhost:3000', WEB_APP_URL: 'http://localhost:8081' })?.localRun).toBe(true)
    expect(resolveSmtpConfig({ ...smtp, NODE_ENV: 'production', BETTER_AUTH_URL: 'https://api.steuereule.example', WEB_APP_URL: 'https://www.steuereule.example' })?.localRun).toBe(false)
    expect(resolveSmtpConfig({ ...smtp, NODE_ENV: 'production', K_SERVICE: 'steuereule-api', BETTER_AUTH_URL: 'http://localhost:3000' })?.localRun).toBe(false)
  })

  it('refuses smtp delivery without SMTP_URL', () => {
    const resolve = () => resolveSmtpConfig({ EMAIL_DELIVERY: 'smtp' })

    expect(resolve).toThrow(/SMTP_URL/)
  })

  it('lets production run without Brevo when smtp is chosen explicitly', () => {
    const result = resolveBrevoConfig({ NODE_ENV: 'production', EMAIL_DELIVERY: 'smtp' })

    expect(result).toBeUndefined()
  })
})

// Sonar S5332: plain SMTP only towards the local inbox in a local run; anything else must speak TLS.
describe('smtpTransportOptions', () => {
  const local = { localRun: true }
  const deployment = { localRun: false }

  it('keeps plain SMTP for the local inbox in a local run (loopback or a compose service name)', () => {
    for (const url of ['smtp://mailpit:1025', 'smtp://localhost:1025', 'smtp://127.0.0.1:1025', 'smtp://[::1]:1025']) {
      expect(smtpTransportOptions(url, local)).toMatchObject({ secure: false, requireTLS: false })
    }
    expect(smtpTransportOptions('smtp://mailpit:1025', local)).toMatchObject({ host: 'mailpit', port: 1025 })
  })

  it('requires TLS on a deployment even for a host that looks local: a single-label name can resolve anywhere', () => {
    for (const url of ['smtp://mailpit:1025', 'smtp://localhost:1025', 'smtp://relay:25']) {
      expect(smtpTransportOptions(url, deployment)).toMatchObject({ requireTLS: true })
    }
  })

  it('requires TLS for any other server, implicit with smtps', () => {
    expect(smtpTransportOptions('smtp://mail.example.de:587', local)).toMatchObject({ host: 'mail.example.de', port: 587, secure: false, requireTLS: true })
    expect(smtpTransportOptions('smtps://mail.example.de', deployment)).toMatchObject({ port: 465, secure: true, requireTLS: true })
  })

  it('passes the credentials of the URL, decoded', () => {
    expect(smtpTransportOptions('smtp://user%40x.de:p%2Fw@mail.example.de:587', local)).toMatchObject({ auth: { user: 'user@x.de', pass: 'p/w' } })
    expect(smtpTransportOptions('smtp://mailpit:1025', local)).not.toHaveProperty('auth')
  })

  it('refuses a URL that is no SMTP URL', () => {
    expect(() => smtpTransportOptions('http://mailpit:1025', { localRun: true })).toThrow(/smtp/)
  })
})
