import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveBrevoConfig } from '../src/auth/brevo-email-sender.js'
import { createEmailSender } from '../src/auth/email-sender.factory.js'
import { createTlsTransport, resolveSmtpConfig, SmtpEmailSender, smtpTransportOptions } from '../src/auth/smtp-email-sender.js'

// Every nodemailer transport the API builds passes through this double, so a test sees its options.
const createTransport = vi.hoisted(() => vi.fn((_options: unknown) => ({ sendMail: async () => ({}) })))
vi.mock('nodemailer', () => ({ createTransport }))

const config = { url: 'smtps://mailpit:1025', senderEmail: 'noreply@steuereule.localhost', senderName: 'SteuerEule' }
const email = {
  to: 'nutzer@example.de',
  subject: 'Bitte bestätige deine E-Mail-Adresse — SteuerEule',
  url: 'http://localhost:3000/api/auth/verify-email?token=abc&callbackURL=http%3A%2F%2Flocalhost%3A8080%2F',
  token: 'abc',
}

const CA_PEM = '-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----\n'
const dir = mkdtempSync(join(tmpdir(), 'smtp-ca-test-'))
const caFile = join(dir, 'ca.pem')
const notPemFile = join(dir, 'not-a-cert.txt')
writeFileSync(caFile, CA_PEM)
writeFileSync(notPemFile, 'hello')
afterAll(() => rmSync(dir, { recursive: true, force: true }))

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
    const result = resolveSmtpConfig({ SMTP_URL: 'smtps://mailpit:1025' })

    expect(result).toBeUndefined()
  })

  it('uses SMTP_URL and a local default sender', () => {
    const result = resolveSmtpConfig({ EMAIL_DELIVERY: 'smtp', SMTP_URL: 'smtps://mailpit:1025' })

    expect(result).toEqual({ url: 'smtps://mailpit:1025', senderEmail: 'noreply@steuereule.localhost', senderName: 'SteuerEule' })
  })

  it('takes the sender from EMAIL_FROM when set', () => {
    const result = resolveSmtpConfig({ EMAIL_DELIVERY: 'smtp', SMTP_URL: 'smtps://mailpit:1025', EMAIL_FROM: 'a@b.de' })

    expect(result?.senderEmail).toBe('a@b.de')
  })

  it('reads the CA file SMTP_CA_CERT names, and refuses one it cannot use', () => {
    const smtp = { EMAIL_DELIVERY: 'smtp', SMTP_URL: 'smtps://mailpit:1025' }
    expect(resolveSmtpConfig({ ...smtp, SMTP_CA_CERT: caFile })?.caCert).toBe(CA_PEM)
    expect(resolveSmtpConfig(smtp)).not.toHaveProperty('caCert')
    expect(() => resolveSmtpConfig({ ...smtp, SMTP_CA_CERT: join(dir, 'missing.pem') })).toThrow(/SMTP_CA_CERT: cannot read/)
    expect(() => resolveSmtpConfig({ ...smtp, SMTP_CA_CERT: notPemFile })).toThrow(/SMTP_CA_CERT: .*no PEM certificate/)
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

// Mail is never sent in clear text (Sonar S5332): every transport requires TLS and verifies the certificate.
describe('smtpTransportOptions', () => {
  it('requires TLS and verifies the certificate for every host, the local inbox included', () => {
    for (const url of ['smtp://mailpit:1025', 'smtp://localhost:1025', 'smtp://127.0.0.1:1025', 'smtp://[::1]:1025', 'smtp://relay:25', 'smtp://mail.example.de:587']) {
      expect(smtpTransportOptions(url)).toMatchObject({ secure: false, requireTLS: true, tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' } })
    }
    expect(smtpTransportOptions('smtp://mail.example.de')).toMatchObject({ host: 'mail.example.de', port: 587 })
  })

  it('speaks implicit TLS with smtps', () => {
    expect(smtpTransportOptions('smtps://mail.example.de')).toMatchObject({ port: 465, secure: true, requireTLS: true, tls: { rejectUnauthorized: true } })
    expect(smtpTransportOptions('smtps://mailpit:1025')).toMatchObject({ host: 'mailpit', port: 1025, secure: true })
  })

  it('trusts a private CA as tls.ca, and only adds it, never loosening the check', () => {
    expect(smtpTransportOptions('smtps://mailpit:1025', { caCert: CA_PEM }).tls).toEqual({ rejectUnauthorized: true, minVersion: 'TLSv1.2', ca: CA_PEM })
    expect(smtpTransportOptions('smtps://mail.example.de').tls).not.toHaveProperty('ca')
  })

  it('passes the credentials of the URL, decoded', () => {
    expect(smtpTransportOptions('smtp://user%40x.de:p%2Fw@mail.example.de:587')).toMatchObject({ auth: { user: 'user@x.de', pass: 'p/w' } })
    expect(smtpTransportOptions('smtps://mailpit:1025')).not.toHaveProperty('auth')
  })

  it('refuses a URL that is no SMTP URL', () => {
    expect(() => smtpTransportOptions('http://mailpit:1025')).toThrow(/smtp/)
  })
})

describe('no code path builds a transport without TLS', () => {
  beforeEach(() => createTransport.mockClear())

  const assertTlsOnly = (options: unknown) => {
    expect(options).toMatchObject({ requireTLS: true, tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' } })
    expect(options).not.toHaveProperty('ignoreTLS')
    expect(options).not.toHaveProperty('opportunisticTLS')
  }

  it('the factory, the sender and the transport helper hand nodemailer TLS-only options, whatever the run', () => {
    const runs: NodeJS.ProcessEnv[] = [
      { NODE_ENV: 'test' },
      { NODE_ENV: 'development' },
      { NODE_ENV: 'production', BETTER_AUTH_URL: 'http://localhost:3000', WEB_APP_URL: 'http://localhost:8081' },
      { NODE_ENV: 'production', K_SERVICE: 'steuereule-api', BETTER_AUTH_URL: 'https://api.steuereule.example' },
    ]
    const urls = ['smtp://mailpit:1025', 'smtp://127.0.0.1:1025', 'smtps://mailpit:1025', 'smtp://mail.example.de:587', 'smtps://user:pw@mail.example.de']
    for (const run of runs) {
      for (const url of urls) {
        createEmailSender({ ...run, EMAIL_DELIVERY: 'smtp', SMTP_URL: url, SMTP_CA_CERT: caFile })
        createEmailSender({ ...run, EMAIL_DELIVERY: 'smtp', SMTP_URL: url })
      }
    }
    expect(new SmtpEmailSender(config)).toBeInstanceOf(SmtpEmailSender)
    createTlsTransport({ host: 'mailpit', port: 1025, secure: false, requireTLS: true, tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' } })

    expect(createTransport).toHaveBeenCalledTimes(runs.length * urls.length * 2 + 2)
    for (const [options] of createTransport.mock.calls) assertTlsOnly(options)
    expect(createTransport.mock.calls.filter(([options]) => (options as { tls: { ca?: string } }).tls.ca === CA_PEM)).toHaveLength(runs.length * urls.length)
  })

  it('nodemailer is called in one place only, the TLS-only helper', () => {
    const src = fileURLToPath(new URL('../src', import.meta.url))
    const files = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]))
    const callers = files(src).filter((file) => file.endsWith('.ts') && /\bcreateTransport\(/.test(readFileSync(file, 'utf8')))
    expect(callers.map((file) => relative(src, file).split('\\').join('/'))).toEqual(['auth/smtp-email-sender.ts'])
    const source = readFileSync(join(src, 'auth/smtp-email-sender.ts'), 'utf8')
    expect(source.match(/\bcreateTransport\(/g)).toHaveLength(1)
    expect(source).toMatch(/createTransport\(\{ host, port, secure, requireTLS: true, tls: \{ \.\.\.tls, rejectUnauthorized: true \}/)
  })
})
