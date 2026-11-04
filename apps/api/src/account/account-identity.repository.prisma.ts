import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { AccountIdentity, AccountIdentityRepository } from './account-identity.repository.js'

@Injectable()
export class PrismaAccountIdentityRepository implements AccountIdentityRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<AccountIdentity | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) return null

    const accounts = await this.prisma.account.findMany({
      where: { userId },
      select: { providerId: true },
    })
    const authProviders = [...new Set(accounts.map((account) => account.providerId))].sort()

    return {
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      authProviders,
    }
  }
}
