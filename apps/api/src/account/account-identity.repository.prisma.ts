import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { AccountIdentity, AccountIdentityRepository } from './account-identity.repository.js'

@Injectable()
export class PrismaAccountIdentityRepository implements AccountIdentityRepository {
  // Explicit token — see the comment on ProfileController's constructor. Plain
  // PrismaService, never ENCRYPTED_PRISMA: User/Account carry no `/// @encrypted`
  // field (ADR-0008 only annotates Profile.steuerId/steuernummer) — there is nothing
  // here for the field-encryption extension to do.
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<AccountIdentity | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) return null

    // Only providerId is selected — never accountId/accessToken/refreshToken/idToken/
    // password (secrets-excluded, ADR-0013 §4/§6).
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
