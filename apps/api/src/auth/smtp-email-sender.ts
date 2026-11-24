import { createTransport } from 'nodemailer'
import { type EmailPurpose, renderEmail } from './email-content.js'
import type { EmailSender, ExistingAccountNotice, VerificationEmail } from './email-sender.js'

export interface SmtpConfig {
  url: string
  senderEmail: string
  senderName: string
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
 * The transport for an SMTP URL. Plain SMTP is only for the local Mailpit; any other server must
 * speak TLS, implicitly with `smtps:` or by STARTTLS, so no mail with a login link crosses a
 * network in clear text (Sonar S5332).
 */
export function smtpTransportOptions(url: string): SmtpTransportOptions {
  const parsed = new URL(url)
  if (parsed.protocol !== 'smtp:' && parsed.protocol !== 'smtps:') {
    throw new Error(`SMTP_URL must start with smtp:// or smtps:// (got ${parsed.protocol}).`)
  }
  const secure = parsed.protocol === 'smtps:'
  const options: SmtpTransportOptions = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : secure ? 465 : 587,
    secure,
    requireTLS: secure || !isLocalHost(parsed.hostname),
  }
  if (parsed.username) options.auth = { user: decodeURIComponent(parsed.username), pass: decodeURIComponent(parsed.password) }
  return options
}

/** EmailSender over plain SMTP — locally against Mailpit, so every mail is visible in a real inbox. */
export class SmtpEmailSender implements EmailSender {
  constructor(
    private readonly config: SmtpConfig,
    // smtpTransportOptions allows plain SMTP only towards the local Mailpit and requires TLS for every other host (tested).
    private readonly transport: SmtpTransport = createTransport(smtpTransportOptions(config.url)), // NOSONAR typescript:S5332 — TLS enforced for non-local hosts in smtpTransportOptions
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

  private async send(email: VerificationEmail | ExistingAccountNotice, purpose: EmailPurpose): Promise<void> {
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
    throw new Error('EMAIL_DELIVERY=smtp needs SMTP_URL (e.g. smtp://mailpit:1025).')
  }
  return {
    url,
    senderEmail: env.EMAIL_FROM?.trim() || LOCAL_SENDER,
    senderName: env.EMAIL_FROM_NAME?.trim() || 'SteuerEule',
  }
}
