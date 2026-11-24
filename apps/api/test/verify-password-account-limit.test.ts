import { describe, expect, it } from 'vitest'
import {
  consumeVerifyPasswordAccountLimit,
  VERIFY_PASSWORD_ACCOUNT_LIMIT,
  VERIFY_PASSWORD_ATTEMPTS_EXCEEDED,
} from '../src/auth/account-sign-in-limit.js'
import { createResettableRateLimitStorage } from '../src/auth/rate-limit-storage.js'

// ADR-0108 (review of ADR-0106 D9): /verify-password is a password oracle capped only per client address.
// This per-account counter closes it. The HTTP wiring runs the counter before the password is checked.
describe('verify-password per-account limit (ADR-0108)', () => {
  it('allows up to the max attempts on one account, then refuses with 429', async () => {
    const storage = createResettableRateLimitStorage()
    for (let i = 0; i < VERIFY_PASSWORD_ACCOUNT_LIMIT.max; i += 1) {
      await expect(consumeVerifyPasswordAccountLimit(storage, 'victim')).resolves.toBeUndefined()
    }
    await expect(consumeVerifyPasswordAccountLimit(storage, 'victim')).rejects.toMatchObject({
      status: 'TOO_MANY_REQUESTS',
      body: { code: VERIFY_PASSWORD_ATTEMPTS_EXCEEDED },
    })
  })

  it('counts each account separately (one account at the cap does not lock out another)', async () => {
    const storage = createResettableRateLimitStorage()
    for (let i = 0; i < VERIFY_PASSWORD_ACCOUNT_LIMIT.max; i += 1) {
      await consumeVerifyPasswordAccountLimit(storage, 'account-a')
    }
    await expect(consumeVerifyPasswordAccountLimit(storage, 'account-b')).resolves.toBeUndefined()
  })
})
