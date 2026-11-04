import { Inject, Injectable } from '@nestjs/common'
import type { IncomingHttpHeaders } from 'node:http'
import { ACCOUNT_DELETION_REPOSITORY, type AccountDeletionRepository } from './account-deletion.repository.js'
import type { DeleteAccountRequestDto } from './dto/delete-account-request.dto.js'
import type { DeleteAccountResponseDto } from './dto/delete-account-response.dto.js'
import { BETTER_AUTH_BUNDLE, type BetterAuthBundle } from '../auth/auth.tokens.js'
import { FreshAuthChecker } from '../auth/fresh-auth.js'

/** Orchestrates DELETE /v1/account: fresh-auth re-verification first, then the one atomic transaction. */
@Injectable()
export class AccountDeletionService {
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
    await this.freshAuthChecker.assertFreshAuth(this.betterAuth, headers, userId, dto.password)

    return this.repository.deleteAccount(userId)
  }
}
