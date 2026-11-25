import { createTransport } from 'nodemailer'
import { isLocalRun } from '../common/run-locality.js'
import { type EmailPurpose, renderEmail } from './email-content.js'
import type { EmailSender, ExistingAccountNotice, UnverifiedAccountWarning, VerificationEmail } from './email-sender.js'

export interface SmtpConfig {
  url: string
  senderEmail: string
  senderName: string
  /** Development, tests or the local production-shaped stack: only then may a local inbox take plain SMTP. */
  localRun: boolean
}

export interface SmtpTransport {
  sendMail(message: { from: { address: string; name: string }; to: string; subject: string; text: string; html: string }): Promise<unknown>
}

const LOCAL_SENDER = 'noreply@steuereule.localhost'

export interface SmtpTransportOptions {
  host: string
  port: number
  /** Implicit TLS from the first byte (`smtps:`). */
  secure: boolean
  /** STARTTLS is required; without it the mail is not sent. */
  requireTLS: boolean
  auth?: { user: string; pass: string }
}

/** Loopback, or a single-label name such as the compose service `mailpit`: the local test inbox. */
function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1' || !host.includes('.')
}

/**
 * The transport for an SMTP URL. A login link travels in these mails, so TLS is required, implicitly with the smtps
 * scheme or by STARTTLS. The one exception is the local test inbox, and only in a run that is local (`localRun`):
 * a host name alone proves nothing, a single-label name can resolve to a server elsewhere on a deployment
 * (Sonar S5332).
 */
export function smtpTransportOptions(url: string, { localRun }: { localRun: boolean }): SmtpTransportOptions {
  const parsed = new URL(url)
  if (parsed.protocol !== 'smtp:' && parsed.protocol !== 'smtps:') {
    throw new Error(`SMTP_URL must use the smtp or smtps scheme (got ${parsed.protocol}).`)
  }
  const secure = parsed.protocol === 'smtps:'
  const options: SmtpTransportOptions = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : secure ? 465 : 587,
    secure,
    requireTLS: secure || !(localRun && isLocalHost(parsed.hostname)),
  }
  if (parsed.username) options.auth = { user: decodeURIComponent(parsed.username), pass: decodeURIComponent(parsed.password) }
  return options
}

/** EmailSender over plain SMTP — locally against Mailpit, so every mail is visible in a real inbox. */
export class SmtpEmailSender implements EmailSender {
  constructor(
    private readonly config: SmtpConfig,
    // smtpTransportOptions requires TLS except towards the local inbox in a local run (tested).
    private readonly transport: SmtpTransport = createTransport(smtpTransportOptions(config.url, { localRun: config.localRun })),
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
    throw new Error('EMAIL_DELIVERY=smtp needs SMTP_URL (the local Mailpit listens on mailpit:1025).')
  }
  return {
    url,
    senderEmail: env.EMAIL_FROM?.trim() || LOCAL_SENDER,
    senderName: env.EMAIL_FROM_NAME?.trim() || 'SteuerEule',
    localRun: isLocalRun(env),
  }
}
