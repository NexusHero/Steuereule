// Dev/test EmailSender (ADR-0012 §6): logs the real verification/reset token+URL
// better-auth generated instead of dispatching an actual email. This is never a
// fixed fake code — the token is the exact one a production provider would have
// delivered — so it is a legitimate stand-in for local/dev/CI use, not a mock of
// the auth flow. No plaintext password ever passes through this seam (better-auth
// hashes with scrypt before account creation completes); nothing here could leak
// one even if it wanted to.
import { Injectable } from '@nestjs/common'
import type { EmailSender, VerificationEmail } from './email-sender.js'

@Injectable()
export class LoggingEmailSender implements EmailSender {
  // Plain console.log, not Nest's Logger: main.ts intentionally restricts the app
  // logger to `['error', 'warn']` (ADR-0012 doesn't touch that), but this stub's
  // entire purpose is to surface the real verification/reset link for manual dev/CI
  // use — it must stay visible regardless of the app's configured log level.
  async sendVerificationEmail(email: VerificationEmail): Promise<void> {
    console.log(`[dev email] verification link for ${email.to}: ${email.url}`)
  }

  async sendPasswordResetEmail(email: VerificationEmail): Promise<void> {
    console.log(`[dev email] password-reset link for ${email.to}: ${email.url}`)
  }
}
