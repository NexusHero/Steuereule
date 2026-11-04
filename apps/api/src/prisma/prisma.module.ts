import { Module } from '@nestjs/common'
import { encryptedPrismaProvider, ENCRYPTED_PRISMA } from './encrypted-prisma.provider.js'
import { PrismaService } from './prisma.service.js'

/** Shared infrastructure module. */
@Module({
  providers: [PrismaService, encryptedPrismaProvider],
  exports: [PrismaService, ENCRYPTED_PRISMA],
})
export class PrismaModule {}
