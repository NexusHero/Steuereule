import { Inject, Injectable } from '@nestjs/common'
import { ASSISTENTEN_REPOSITORY, type AssistentenRepository } from './assistenten.repository.js'
import type { OauthClientInfoDto, VerbundenerAssistentDto } from './dto/assistenten.dto.js'

@Injectable()
export class AssistentenService {
  constructor(
    @Inject(ASSISTENTEN_REPOSITORY)
    private readonly repository: AssistentenRepository,
  ) {}

  async listConnected(userId: string): Promise<VerbundenerAssistentDto[]> {
    const list = await this.repository.findConnectedForUser(userId)
    return list.map((item) => ({
      clientId: item.clientId,
      name: item.name,
      verbundenSeit: item.verbundenSeit.toISOString(),
      zuletztGenutzt: item.zuletztGenutzt?.toISOString() ?? null,
    }))
  }

  async revoke(userId: string, clientId: string): Promise<void> {
    await this.repository.revokeForUser(userId, clientId)
  }

  async getClientInfo(clientId: string): Promise<OauthClientInfoDto | null> {
    return this.repository.findClientInfo(clientId)
  }
}
