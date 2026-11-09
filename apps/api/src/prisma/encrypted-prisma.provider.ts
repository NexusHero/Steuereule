import type { FactoryProvider } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { fieldEncryptionExtension } from 'prisma-field-encryption'
import { resolveFieldEncryptionKey } from './field-encryption-key.js'
import { PrismaService } from './prisma.service.js'
import { transactionAwareClient } from './transaction.js'

export const ENCRYPTED_PRISMA = Symbol('ENCRYPTED_PRISMA')

export type EncryptedPrismaClient = PrismaClient

export const encryptedPrismaProvider: FactoryProvider<EncryptedPrismaClient> = {
  provide: ENCRYPTED_PRISMA,
  inject: [PrismaService],
  useFactory: (prisma: PrismaService): EncryptedPrismaClient => {
    const { encryptionKey, decryptionKeys } = resolveFieldEncryptionKey()
    const extended = prisma.$extends(fieldEncryptionExtension({ encryptionKey, decryptionKeys }))
    return transactionAwareClient(extended as unknown as PrismaClient)
  },
}
