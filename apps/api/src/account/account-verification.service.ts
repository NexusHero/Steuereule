import { Inject, Injectable } from '@nestjs/common'
import { unverifiedDeletionNotBefore } from '@steuereule/core'
import { ACCOUNT_IDENTITY_REPOSITORY, type AccountIdentityRepository } from './account-identity.repository.js'
import type { AccountVerificationDto } from './dto/account-verification.dto.js'

/** ADR-0030 §2: the in-app warning of a never-verified account reads its deletion floor here. */
@Injectable()
export class AccountVerificationService {
  constructor(@Inject(ACCOUNT_IDENTITY_REPOSITORY) private readonly identities: AccountIdentityRepository) {}

  async status(userId: string, now: Date = new Date()): Promise<AccountVerificationDto | null> {
    const account = await this.identities.findByUserId(userId)
    if (!account) return null
    if (account.emailVerified) return { emailVerified: true, deletionNotBefore: null }
    return { emailVerified: false, deletionNotBefore: unverifiedDeletionNotBefore(account.createdAt, account.unverifiedWarningSentAt ?? null, now).toISOString() }
  }
}
