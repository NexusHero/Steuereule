import { Inject, Injectable } from '@nestjs/common'
import { USER_KEY_STORE, type UserKeyStore } from '../keystore/user-key-store.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { AccountDeletionRepository } from './account-deletion.repository.js'
import { deleteAccountTransaction, type DeleteAccountResult } from './delete-account-transaction.js'

@Injectable()
export class PrismaAccountDeletionRepository implements AccountDeletionRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(USER_KEY_STORE) private readonly keys: UserKeyStore,
  ) {}

  async deleteAccount(userId: string): Promise<DeleteAccountResult> {
    // Crypto-shredding (ADR-0059, Art. 17 DSGVO): the receipt key lives in the keystore
    // database, so it cannot join the tax-data transaction. It is destroyed FIRST: should the
    // transaction below fail, the files are already unreadable and a retry finishes the job —
    // never the reverse (rows gone, key alive, backups decryptable forever). A legal hold on
    // tax data keeps the key, because the held files must stay readable.
    const taxDataHeld =
      (await this.prisma.legalHold.count({ where: { userId, resource: 'taxData', holdUntil: { gt: new Date() } } })) > 0
    if (!taxDataHeld) {
      await this.keys.destroy(userId)
      // ADR-0062: every household person has an own key; destroying it shreds their facts.
      const persons = await this.prisma.householdPerson.findMany({ where: { householdUserId: userId }, select: { id: true } })
      for (const person of persons) await this.keys.destroy(`household-person:${person.id}`)
    }
    return deleteAccountTransaction(this.prisma, userId)
  }
}
