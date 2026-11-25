import { Module } from '@nestjs/common'
import { encryptedPrismaProvider, ENCRYPTED_PRISMA, type EncryptedPrismaClient } from './encrypted-prisma.provider.js'
import { PrismaService } from './prisma.service.js'
import { KEYED_LOCK } from '../common/keyed-lock.js'
import { TRANSACTION_RUNNER } from '../common/transaction-runner.js'
import { PrismaKeyedLock, PrismaTransactionRunner } from './transaction.js'

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
  ],
  exports: [PrismaService, ENCRYPTED_PRISMA, TRANSACTION_RUNNER, KEYED_LOCK],
})
export class PrismaModule {}
