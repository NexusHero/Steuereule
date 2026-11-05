import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { AssistantRepository, ClientInfo, ConnectedAssistant } from './assistenten.repository.js'

@Injectable()
export class PrismaAssistentenRepository implements AssistantRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findConnectedForUser(userId: string): Promise<ConnectedAssistant[]> {
    const consents = await this.prisma.oauthConsent.findMany({
      where: { userId },
      include: { client: true },
      orderBy: { createdAt: 'desc' },
    })

    const results: ConnectedAssistant[] = []
    for (const consent of consents) {
      const latestToken = await this.prisma.oauthAccessToken.findFirst({
        where: { userId, clientId: consent.clientId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      })

      results.push({
        clientId: consent.clientId,
        name: consent.client?.name ?? 'Unbekannter Assistent',
        verbundenSeit: consent.createdAt ?? new Date(),
        zuletztGenutzt: latestToken?.createdAt ?? null,
      })
    }

    return results
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
