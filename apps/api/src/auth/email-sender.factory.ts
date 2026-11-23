import { BrevoEmailSender, resolveBrevoConfig } from './brevo-email-sender.js'
import type { EmailSender } from './email-sender.js'
import { LoggingEmailSender } from './logging-email-sender.js'
import { resolveSmtpConfig, SmtpEmailSender } from './smtp-email-sender.js'

/**
 * Builds the EmailSender, failing CLOSED in production (ADR-0104 M1).
 *
 * `LoggingEmailSender` writes the full verification / password-reset URL — which carries the one-time
 * account-takeover token — to the application log. It is a dev/test convenience.
 *
 * `resolveBrevoConfig` already fails closed in production when email is *unconfigured*, but it returns
 * `undefined` without throwing when an operator sets `EMAIL_DELIVERY=log` — and the old factory then handed
 * back `LoggingEmailSender`, leaking every reset/verification token into the production logs (ADR-0104 M1).
 * This guard closes that last fail-open path: outside production `log` mode is fine, in production it throws,
 * mirroring every other secret resolver (`resolveGuestSessionSecret`, `resolveFieldEncryptionKey`, the
 * keystore, trusted-proxies), which all refuse a guessable/unsafe default in prod.
 */
export function createEmailSender(env: NodeJS.ProcessEnv = process.env): EmailSender {
  const smtp = resolveSmtpConfig(env)
  if (smtp) return new SmtpEmailSender(smtp)
  const brevo = resolveBrevoConfig(env)
  if (brevo) return new BrevoEmailSender(brevo)
  if (env.NODE_ENV === 'production') {
    // Only reachable via EMAIL_DELIVERY=log (otherwise resolveBrevoConfig has already thrown).
    throw new Error(
      'EMAIL_DELIVERY=log (or no email provider) is refused in production — it would write ' +
        'verification/password-reset tokens to the application log instead of sending them.',
    )
  }
  return new LoggingEmailSender()
}
