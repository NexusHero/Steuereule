import { Inject, Injectable } from '@nestjs/common'
import { USER_KEY_STORE, type UserKeyStore } from '../keystore/user-key-store.js'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { AccountDeletionRepository, DeleteAccountResult } from './account-deletion.repository.js'
import { deleteAccountTransaction } from './delete-account-transaction.prisma.js'

@Injectable()
export class PrismaAccountDeletionRepository implements AccountDeletionRepository {
  constructor(
    @Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient,
    @Inject(USER_KEY_STORE) private readonly keys: UserKeyStore,
  ) {}

  async deleteAccount(userId: string): Promise<DeleteAccountResult> {
    // Crypto-shredding (ADR-0059, Art. 17 DSGVO): the receipt key lives in the keystore
    // database, so it cannot join the tax-data transaction. It is destroyed FIRST: should the
    // transaction below fail, the files are already unreadable and a retry finishes the job —
    // never the reverse (rows gone, key alive, backups decryptable forever). A legal hold on
    // tax data keeps the key, because the held files must stay readable.
    //
    // Scope (pentest 2026-11-23, ADR-0107 H4): crypto-shredding here makes only the keystore-wrapped
    // data irrecoverable from backups — receipt file bytes and HouseholdPerson.sealed, each under a
    // per-user/per-person DEK destroyed above. The `@encrypted` Prisma COLUMNS (steuerId, name, Lstb
    // income, advisor chat, …) are removed by the row deletion in deleteAccountTransaction, NOT
    // crypto-shredded: they share one global PRISMA_FIELD_ENCRYPTION_KEY (ADR-0008) that is not
    // rotated on deletion, so a pre-deletion backup still decrypts them until that backup's retention
    // window expires. Backup retention is the compensating control for those columns; true per-user
    // field keys are the architectural follow-up if Art. 17 must reach backups for them too.
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
