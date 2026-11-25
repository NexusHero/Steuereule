import { Module } from '@nestjs/common'
import { encryptedPrismaProvider, ENCRYPTED_PRISMA, type EncryptedPrismaClient } from './encrypted-prisma.provider.js'
import { PrismaService } from './prisma.service.js'
import { KEYED_LOCK } from '../common/keyed-lock.js'
import { TRANSACTION_RUNNER } from '../common/transaction-runner.js'
import { PrismaKeyedLock, PrismaTransactionRunner } from './transaction.js'
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
    {
      // Caps counted and filled under one lock (ADR-0052 amendment 9, beta P4).
      provide: KEYED_LOCK,
      inject: [ENCRYPTED_PRISMA],
      useFactory: (client: EncryptedPrismaClient) => new PrismaKeyedLock(client),
    },
    // The same keys the encrypted client uses; the owl's Redis run log derives its key from them (H2-9).
    { provide: FIELD_ENCRYPTION_KEYS, useFactory: () => resolveFieldEncryptionKey() },
  ],
  exports: [PrismaService, ENCRYPTED_PRISMA, TRANSACTION_RUNNER, KEYED_LOCK, FIELD_ENCRYPTION_KEYS],
})
export class PrismaModule {}
