import { describe, expect, it } from 'vitest'
import { AccountVerificationService } from '../src/account/account-verification.service.js'
import type { AccountIdentity } from '../src/account/account-identity.repository.js'

const account = (patch: Partial<AccountIdentity>): AccountIdentity => ({
  email: 'a@example.test',
  name: 'A',
  emailVerified: false,
  createdAt: new Date('2026-11-01T10:00:00Z'),
  unverifiedWarningSentAt: null,
  authProviders: ['credential'],
  ...patch,
})

const serviceOver = (identity: AccountIdentity | null) => new AccountVerificationService({ findByUserId: async () => identity })

/** API-16 (ADR-0030 §2): the in-app warning shows the date no sooner than which the account is deleted. */
describe('AccountVerificationService', () => {
  const now = new Date('2026-11-25T10:00:00Z')

  it('a never-verified account gets its deletion floor', async () => {
    expect(await serviceOver(account({ unverifiedWarningSentAt: new Date('2026-11-24T10:00:00Z') })).status('u', now)).toEqual({
      emailVerified: false,
      deletionNotBefore: '2026-12-01T10:00:00.000Z',
    })
  })

  it('a verified account has none, a guest has no status', async () => {
    expect(await serviceOver(account({ emailVerified: true })).status('u', now)).toEqual({ emailVerified: true, deletionNotBefore: null })
    expect(await serviceOver(null).status('u', now)).toBeNull()
  })
})
