import { Module } from '@nestjs/common'
import { encryptedPrismaProvider, ENCRYPTED_PRISMA, type EncryptedPrismaClient } from './encrypted-prisma.provider.js'
import { PrismaService } from './prisma.service.js'
import { PrismaTransactionRunner, TRANSACTION_RUNNER } from './transaction.js'

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
  ],
  exports: [PrismaService, ENCRYPTED_PRISMA, TRANSACTION_RUNNER],
})
export class PrismaModule {}
