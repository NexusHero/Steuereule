import { readFileSync } from 'node:fs'
import { createTransport } from 'nodemailer'
import { type EmailPurpose, renderEmail } from './email-content.js'
import type { EmailSender, ExistingAccountNotice, UnverifiedAccountWarning, VerificationEmail } from './email-sender.js'

export interface SmtpConfig {
  url: string
  senderEmail: string
  senderName: string
  /** PEM of a private CA that signed the server certificate (`SMTP_CA_CERT`), e.g. the local Mailpit's. */
  caCert?: string
}

export interface SmtpTransport {
  sendMail(message: { from: { address: string; name: string }; to: string; subject: string; text: string; html: string }): Promise<unknown>
}

const LOCAL_SENDER = 'noreply@steuereule.localhost'

/**
 * The only shape of nodemailer options this module builds. The literal types make a transport without TLS a type
 * error: `requireTLS` and `rejectUnauthorized` cannot be anything but true.
 */
export interface SmtpTransportOptions {
  host: string
  port: number
  /** Implicit TLS from the first byte (`smtps:`); otherwise the connection upgrades with STARTTLS. */
  secure: boolean
  /** STARTTLS is required: a server that does not offer it gets no mail. */
  requireTLS: true
  tls: {
    /** The server certificate is verified against the system CAs, or only against `ca` when that is set. */
    rejectUnauthorized: true
    minVersion: 'TLSv1.2'
    ca?: string
  }
  auth?: { user: string; pass: string }
}

/**
 * The transport for an SMTP URL. A login link travels in these mails, so every connection is encrypted and the
 * server certificate is verified, on every host and in every run: implicit TLS with the smtps scheme, required
 * STARTTLS with the smtp scheme. A private CA (the local Mailpit's) is trusted through `caCert`, never by
 * switching verification off.
 */
export function smtpTransportOptions(url: string, { caCert }: { caCert?: string | undefined } = {}): SmtpTransportOptions {
  const parsed = new URL(url)
  if (parsed.protocol !== 'smtp:' && parsed.protocol !== 'smtps:') {
    throw new Error(`SMTP_URL must use the smtp or smtps scheme (got ${parsed.protocol}).`)
  }
  const secure = parsed.protocol === 'smtps:'
  const tls: SmtpTransportOptions['tls'] = { rejectUnauthorized: true, minVersion: 'TLSv1.2' }
  if (caCert) tls.ca = caCert
  const options: SmtpTransportOptions = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : secure ? 465 : 587,
    secure,
    requireTLS: true,
    tls,
  }
  if (parsed.username) options.auth = { user: decodeURIComponent(parsed.username), pass: decodeURIComponent(parsed.password) }
  return options
}

/**
 * The one place a nodemailer transport is created. The options are spelled out here, with `requireTLS: true` and
 * the verifying `tls` options at the call, so the TLS-only shape is visible where the connection is opened.
 */
export function createTlsTransport({ host, port, secure, tls, auth }: SmtpTransportOptions): SmtpTransport {
  return createTransport({ host, port, secure, requireTLS: true, tls: { ...tls, rejectUnauthorized: true }, ...(auth ? { auth } : {}) })
}

/** Reads the PEM file `SMTP_CA_CERT` names; a path that cannot be read stops the boot instead of the first mail. */
function readCaCert(path: string): string {
  let pem: string
  try {
    pem = readFileSync(path, 'utf8')
  } catch (error) {
    throw new Error(`SMTP_CA_CERT: cannot read ${path}.`, { cause: error })
  }
  if (!pem.includes('-----BEGIN CERTIFICATE-----')) throw new Error(`SMTP_CA_CERT: ${path} holds no PEM certificate.`)
  return pem
}

/** EmailSender over SMTP with TLS — locally against Mailpit, so every mail is visible in a real inbox. */
export class SmtpEmailSender implements EmailSender {
  constructor(
    private readonly config: SmtpConfig,
    private readonly transport: SmtpTransport = createTlsTransport(smtpTransportOptions(config.url, { caCert: config.caCert })),
  ) {}

  async sendVerificationEmail(email: VerificationEmail): Promise<void> {
    await this.send(email, 'verification')
  }

  async sendPasswordResetEmail(email: VerificationEmail): Promise<void> {
    await this.send(email, 'password-reset')
  }

  async sendExistingAccountNotice(email: ExistingAccountNotice): Promise<void> {
    await this.send(email, 'existing-account')
  }

  async sendUnverifiedAccountWarning(email: UnverifiedAccountWarning): Promise<void> {
    await this.send(email, email.final ? 'unverified-final' : 'unverified-warning')
  }

  private async send(email: VerificationEmail | ExistingAccountNotice | UnverifiedAccountWarning, purpose: EmailPurpose): Promise<void> {
    await this.transport.sendMail({
      from: { address: this.config.senderEmail, name: this.config.senderName },
      to: email.to,
      ...renderEmail(email, purpose),
    })
  }
}

export function resolveSmtpConfig(env: NodeJS.ProcessEnv = process.env): SmtpConfig | undefined {
  if (env.EMAIL_DELIVERY !== 'smtp') return undefined
  const url = env.SMTP_URL?.trim()
  if (!url) {
    throw new Error('EMAIL_DELIVERY=smtp needs SMTP_URL (the local Mailpit takes smtps://mailpit:1025).')
  }
  const caPath = env.SMTP_CA_CERT?.trim()
  const config: SmtpConfig = {
    url,
    senderEmail: env.EMAIL_FROM?.trim() || LOCAL_SENDER,
    senderName: env.EMAIL_FROM_NAME?.trim() || 'SteuerEule',
  }
  if (caPath) config.caCert = readCaCert(caPath)
  return config
}
