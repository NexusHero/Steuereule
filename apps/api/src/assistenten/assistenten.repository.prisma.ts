import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { AssistantRepository, ClientInfo, ConnectedAssistant } from './assistenten.repository.js'

@Injectable()
export class PrismaAssistantsRepository implements AssistantRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findConnectedForUser(userId: string): Promise<ConnectedAssistant[]> {
    const consents = await this.prisma.oauthConsent.findMany({
      where: { userId },
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    // One grouped query for every client instead of one lookup per consent.
    const latestTokens = await this.prisma.oauthAccessToken.groupBy({
      by: ['clientId'],
      where: { userId, clientId: { in: consents.map((consent) => consent.clientId) } },
      _max: { createdAt: true },
    })
    const lastUsedByClient = new Map(latestTokens.map((row) => [row.clientId, row._max.createdAt]))

    return consents.map((consent) => ({
      clientId: consent.clientId,
      name: consent.client?.name ?? 'Unbekannter Assistent',
      linkedSince: consent.createdAt ?? new Date(),
      lastUsed: lastUsedByClient.get(consent.clientId) ?? null,
    }))
  }

  async revokeForUser(userId: string, clientId: string): Promise<void> {
    const now = new Date()
    await this.prisma.$transaction([
      this.prisma.oauthAccessToken.updateMany({
        where: { userId, clientId, revoked: null },
        data: { revoked: now },
      }),
      this.prisma.oauthRefreshToken.updateMany({
        where: { userId, clientId, revoked: null },
        data: { revoked: now },
      }),
      this.prisma.oauthConsent.deleteMany({
        where: { userId, clientId },
      }),
    ])
  }

  async findClientInfo(clientId: string): Promise<ClientInfo | null> {
    const client = await this.prisma.oauthClient.findFirst({
      where: { clientId },
      select: { clientId: true, name: true, uri: true, icon: true },
    })

    if (!client) return null

    return {
      clientId: client.clientId,
      name: client.name ?? 'Unbekannter Assistent',
      uri: client.uri ?? null,
      icon: client.icon ?? null,
    }
  }
}
