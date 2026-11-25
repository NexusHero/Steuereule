import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { DeleteAccountResult } from './account-deletion.repository.js'
import type { LifecycleSweepRepository, UnverifiedSweepDeps } from './lifecycle-sweep.repository.js'
import { sweepEndedLegalHolds, sweepEndedLoginRecords, sweepOldAuditRows, sweepUnverifiedAccounts } from './lifecycle-sweeps.prisma.js'

/** The encrypted client: the warning needs User.email in clear (ADR-0109 stores it as ciphertext). */
@Injectable()
export class PrismaLifecycleSweepRepository implements LifecycleSweepRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  sweepEndedLegalHolds(erase: (userId: string) => Promise<DeleteAccountResult>, now: Date) {
    return sweepEndedLegalHolds(this.prisma as never, erase, now)
  }

  sweepUnverifiedAccounts(deps: UnverifiedSweepDeps, now: Date) {
    return sweepUnverifiedAccounts({ ...deps, db: this.prisma as never }, now)
  }

  sweepEndedLoginRecords(now: Date) {
    return sweepEndedLoginRecords(this.prisma as never, now)
  }

  sweepOldAuditRows(now: Date) {
    return sweepOldAuditRows(this.prisma as never, now)
  }
}
