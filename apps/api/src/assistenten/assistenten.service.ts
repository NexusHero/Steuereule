import { Inject, Injectable } from '@nestjs/common'
import { ASSISTANT_REPOSITORY, type AssistantRepository } from './assistenten.repository.js'
import type { OauthClientInfoDto, ConnectedAssistantDto } from './dto/assistenten.dto.js'

@Injectable()
export class AssistantsService {
  constructor(
    @Inject(ASSISTANT_REPOSITORY)
    private readonly repository: AssistantRepository,
  ) {}

  async listConnected(userId: string): Promise<ConnectedAssistantDto[]> {
    const list = await this.repository.findConnectedForUser(userId)
    return list.map((item) => ({
      clientId: item.clientId,
      name: item.name,
      linkedSince: item.linkedSince.toISOString(),
      lastUsed: item.lastUsed?.toISOString() ?? null,
    }))
  }

  async revoke(userId: string, clientId: string): Promise<void> {
    await this.repository.revokeForUser(userId, clientId)
  }

  async getClientInfo(clientId: string): Promise<OauthClientInfoDto | null> {
    return this.repository.findClientInfo(clientId)
  }
}
