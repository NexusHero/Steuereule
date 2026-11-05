import { createTransport } from 'nodemailer'
import { type EmailPurpose, renderEmail } from './email-content.js'
import type { EmailSender, VerificationEmail } from './email-sender.js'

export interface SmtpConfig {
  url: string
  senderEmail: string
  senderName: string
}

export interface SmtpTransport {
  sendMail(message: { from: { address: string; name: string }; to: string; subject: string; text: string; html: string }): Promise<unknown>
}

const LOCAL_SENDER = 'noreply@steuereule.localhost'

/** EmailSender over plain SMTP — locally against Mailpit, so every mail is visible in a real inbox. */
export class SmtpEmailSender implements EmailSender {
  constructor(
    private readonly config: SmtpConfig,
    private readonly transport: SmtpTransport = createTransport(config.url),
  ) {}

  async sendVerificationEmail(email: VerificationEmail): Promise<void> {
    await this.send(email, 'verification')
  }

  async sendPasswordResetEmail(email: VerificationEmail): Promise<void> {
    await this.send(email, 'password-reset')
  }

  private async send(email: VerificationEmail, purpose: EmailPurpose): Promise<void> {
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
