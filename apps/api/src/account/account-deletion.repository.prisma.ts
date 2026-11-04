import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { AccountDeletionRepository } from './account-deletion.repository.js'
import { deleteAccountTransaction, type DeleteAccountResult } from './delete-account-transaction.js'

@Injectable()
export class PrismaAccountDeletionRepository implements AccountDeletionRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  deleteAccount(userId: string): Promise<DeleteAccountResult> {
    return deleteAccountTransaction(this.prisma, userId)
  }
}
