import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../prisma/encrypted-prisma.provider.js'
import type { AccountIdentity, AccountIdentityRepository } from './account-identity.repository.js'

@Injectable()
export class PrismaAccountIdentityRepository implements AccountIdentityRepository {
  constructor(@Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient) {}

  async findByUserId(userId: string): Promise<AccountIdentity | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) return null

    const accounts = await this.prisma.account.findMany({
      where: { userId },
      select: { providerId: true },
    })
    const authProviders = [...new Set(accounts.map((account) => account.providerId))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

    return {
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      unverifiedWarningSentAt: user.unverifiedWarningSentAt ?? null,
      authProviders,
    }
  }
}
