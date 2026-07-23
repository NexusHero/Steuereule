// Shared infrastructure module: the plain connection (PrismaService) and the
// field-encryption-extended client (ENCRYPTED_PRISMA) it feeds, exported together so
// every feature module (ProfileModule, AuditModule, ...) shares the exact same
// PrismaClient connection and the exact same extended client instance — never a
// second, separately-connected client.
import { Module } from '@nestjs/common'
import { encryptedPrismaProvider, ENCRYPTED_PRISMA } from './encrypted-prisma.provider.js'
import { PrismaService } from './prisma.service.js'

@Module({
  providers: [PrismaService, encryptedPrismaProvider],
  exports: [PrismaService, ENCRYPTED_PRISMA],
})
export class PrismaModule {}
