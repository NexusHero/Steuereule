// Orchestrates DELETE /v1/account (ADR-0013): fresh-auth re-verification first (never
// skip it, never let a stale/forged confirm alone trigger real teardown), then the one
// atomic transaction. Trusts that `userId` was produced by UserContextGuard (never
// accepts it from the DTO) exactly like ProfileService.
import { Inject, Injectable } from '@nestjs/common'
import type { IncomingHttpHeaders } from 'node:http'
import { ACCOUNT_DELETION_REPOSITORY, type AccountDeletionRepository } from './account-deletion.repository.js'
import type { DeleteAccountRequestDto } from './dto/delete-account-request.dto.js'
import type { DeleteAccountResponseDto } from './dto/delete-account-response.dto.js'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from '../auth/auth.tokens.js'
import { FreshAuthChecker } from '../auth/fresh-auth.js'

@Injectable()
export class AccountDeletionService {
  // Explicit tokens — see the comment on ProfileController's constructor.
  constructor(
    @Inject(ACCOUNT_DELETION_REPOSITORY) private readonly repository: AccountDeletionRepository,
    @Inject(BETTER_AUTH_BUNDLE) private readonly betterAuth: BetterAuthBundle,
    @Inject(FreshAuthChecker) private readonly freshAuthChecker: FreshAuthChecker,
  ) {}

  async deleteAccount(
    userId: string,
    dto: DeleteAccountRequestDto,
    headers: IncomingHttpHeaders,
  ): Promise<DeleteAccountResponseDto> {
    // Throws (403/400/401) unless the caller genuinely holds a fresh — or
    // freshly-password-reverified — real account session for this exact userId.
    // Nothing below this line ever runs otherwise.
    await this.freshAuthChecker.assertFreshAuth(this.betterAuth, headers, userId, dto.password)

    return this.repository.deleteAccount(userId)
  }
}
