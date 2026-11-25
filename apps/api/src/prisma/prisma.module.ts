import { Module } from '@nestjs/common'
import { encryptedPrismaProvider, ENCRYPTED_PRISMA, type EncryptedPrismaClient } from './encrypted-prisma.provider.js'
import { PrismaService } from './prisma.service.js'
import { TRANSACTION_RUNNER } from '../common/transaction-runner.js'
import { PrismaTransactionRunner } from './transaction.js'
import { FIELD_ENCRYPTION_KEYS } from '../common/field-encryption-keys.js'
import { resolveFieldEncryptionKey } from './field-encryption-key.js'

/** Shared infrastructure module. */
@Module({
  providers: [
    PrismaService,
    encryptedPrismaProvider,
    {
      provide: TRANSACTION_RUNNER,
      inject: [ENCRYPTED_PRISMA],
      useFactory: (client: EncryptedPrismaClient) => new PrismaTransactionRunner(client),
    },
    // The same keys the encrypted client uses; the owl's Redis run log derives its key from them (H2-9).
    { provide: FIELD_ENCRYPTION_KEYS, useFactory: () => resolveFieldEncryptionKey() },
  ],
  exports: [PrismaService, ENCRYPTED_PRISMA, TRANSACTION_RUNNER, FIELD_ENCRYPTION_KEYS],
})
export class PrismaModule {}
