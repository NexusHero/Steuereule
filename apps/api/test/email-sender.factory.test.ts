import { describe, expect, it } from 'vitest'
import { createEmailSender } from '../src/auth/email-sender.factory.js'
import { LoggingEmailSender } from '../src/auth/logging-email-sender.js'

// ADR-0104 M1 — LoggingEmailSender writes verification/reset tokens to the log; it must never be the
// production sender. The last fail-open path is EMAIL_DELIVERY=log (resolveBrevoConfig returns undefined
// without throwing for it), which the old factory honoured even in production.
describe('createEmailSender', () => {
  it('refuses EMAIL_DELIVERY=log in production (the real token-logging fail-open)', () => {
    expect(() => createEmailSender({ NODE_ENV: 'production', EMAIL_DELIVERY: 'log' })).toThrow(/production/)
  })

  it('also fails closed in production when email is entirely unconfigured (via resolveBrevoConfig)', () => {
    expect(() => createEmailSender({ NODE_ENV: 'production' })).toThrow()
  })

  it('uses the dev LoggingEmailSender in log mode outside production', () => {
    expect(createEmailSender({ NODE_ENV: 'test', EMAIL_DELIVERY: 'log' })).toBeInstanceOf(LoggingEmailSender)
    expect(createEmailSender({ NODE_ENV: 'development' })).toBeInstanceOf(LoggingEmailSender)
  })
})
