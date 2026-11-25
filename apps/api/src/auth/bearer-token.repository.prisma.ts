import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { systemDatabaseClient } from '../common/database-identity.js'
import type { AssistantClient, BearerTokenRepository, OpaqueAccessToken } from './bearer-token.repository.js'

@Injectable()
export class PrismaBearerTokenRepository implements BearerTokenRepository {
  private readonly prisma: PrismaService

  constructor(@Inject(PrismaService) prisma: PrismaService) {
    // A system path as a whole (P11): bearer-token.
    this.prisma = systemDatabaseClient(prisma, 'bearer-token')
  }

  async findOpaqueToken(tokenHash: string): Promise<OpaqueAccessToken | null> {
    const row = await this.prisma.oauthAccessToken.findUnique({
      where: { token: tokenHash },
      include: { client: { select: { name: true, disabled: true } } },
    })
    if (!row) return null
    return {
      userId: row.userId,
      clientId: row.clientId,
      scopes: row.scopes,
      revoked: row.revoked,
      expiresAt: row.expiresAt,
      client: toClient(row.client),
    }
  }

  async findClient(clientId: string): Promise<AssistantClient | null> {
    const row = await this.prisma.oauthClient.findUnique({ where: { clientId }, select: { name: true, disabled: true } })
    return row ? toClient(row) : null
  }

  async hasConsent(userId: string, clientId: string): Promise<boolean> {
    const row = await this.prisma.oauthConsent.findFirst({ where: { userId, clientId }, select: { id: true } })
    return row !== null
  }
}

function toClient(row: { name: string | null; disabled: boolean | null }): AssistantClient {
  return { name: row.name, disabled: row.disabled === true }
}
