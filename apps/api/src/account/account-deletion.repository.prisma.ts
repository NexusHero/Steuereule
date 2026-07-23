import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { AccountDeletionRepository } from './account-deletion.repository.js'
import { deleteAccountTransaction, type DeleteAccountResult } from './delete-account-transaction.js'

@Injectable()
export class PrismaAccountDeletionRepository implements AccountDeletionRepository {
  // Explicit token — see the comment on ProfileController's constructor for why.
  // Deliberately the *plain* PrismaService, never ENCRYPTED_PRISMA (ADR-0013 §3): the
  // teardown transaction only deletes rows and re-keys the audit userId, it never
  // reads/writes Profile.steuerId/steuernummer.
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  deleteAccount(userId: string): Promise<DeleteAccountResult> {
    return deleteAccountTransaction(this.prisma, userId)
  }
}
