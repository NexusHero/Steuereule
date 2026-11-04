import { Injectable, Logger } from '@nestjs/common'
import type { EmailSender, VerificationEmail } from './email-sender.js'

/** Dev/test EmailSender: logs the verification/reset link instead of dispatching an actual email. */
@Injectable()
export class LoggingEmailSender implements EmailSender {
  private readonly logger = new Logger('DevEmail')

  async sendVerificationEmail(email: VerificationEmail): Promise<void> {
    this.logger.warn(`verification link for ${maskAddress(email.to)}: ${email.url}`)
  }

  async sendPasswordResetEmail(email: VerificationEmail): Promise<void> {
    this.logger.warn(`password-reset link for ${maskAddress(email.to)}: ${email.url}`)
  }
}

function maskAddress(address: string): string {
  const [local = '', domain = ''] = address.split('@')
  return `${local.slice(0, 1)}***@${domain}`
}
