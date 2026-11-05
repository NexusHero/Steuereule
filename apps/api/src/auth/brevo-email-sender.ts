import { type EmailPurpose, renderEmail } from './email-content.js'
import type { EmailSender, VerificationEmail } from './email-sender.js'

export const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email'

export interface BrevoConfig {
  apiKey: string
  senderEmail: string
  senderName: string
}

type Fetch = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status'>>

/** Production EmailSender: Brevo's transactional API — EU-hosted, so the address and the token-bearing link never leave the EU. */
export class BrevoEmailSender implements EmailSender {
  constructor(
    private readonly config: BrevoConfig,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async sendVerificationEmail(email: VerificationEmail): Promise<void> {
    await this.send(email, 'verification')
  }

  async sendPasswordResetEmail(email: VerificationEmail): Promise<void> {
    await this.send(email, 'password-reset')
  }

  private async send(email: VerificationEmail, purpose: EmailPurpose): Promise<void> {
    const { subject, text, html } = renderEmail(email, purpose)
    const response = await this.fetchImpl(BREVO_SEND_URL, {
      method: 'POST',
      headers: {
        'api-key': this.config.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: this.config.senderEmail, name: this.config.senderName },
        to: [{ email: email.to }],
        subject,
        textContent: text,
        htmlContent: html,
      }),
    })
    if (!response.ok) {
      throw new Error(`Brevo rejected the email (HTTP ${response.status})`)
    }
  }
}

export function resolveBrevoConfig(env: NodeJS.ProcessEnv = process.env): BrevoConfig | undefined {
  if (env.EMAIL_DELIVERY === 'log' || env.EMAIL_DELIVERY === 'smtp') return undefined
  const apiKey = env.BREVO_API_KEY?.trim()
  const senderEmail = env.EMAIL_FROM?.trim()
  if (apiKey && senderEmail) {
    return { apiKey, senderEmail, senderName: env.EMAIL_FROM_NAME?.trim() || 'SteuerEule' }
  }
  if (apiKey || senderEmail) {
    throw new Error('BREVO_API_KEY and EMAIL_FROM must be set together — one without the other cannot send.')
  }
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'BREVO_API_KEY and EMAIL_FROM must be set in production — without them verification and ' +
        'password-reset links would only be logged, never delivered (#83).',
    )
  }
  return undefined
}
