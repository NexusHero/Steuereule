import { Inject, Injectable, Optional } from '@nestjs/common'
import { assistantAuditSource } from '../audit/audit-source.js'
import { AuditService } from '../audit/audit.service.js'
import { ASSISTANT_REPOSITORY, type AssistantRepository } from './assistenten.repository.js'
import { redirectDestinationOf } from './redirect-destination.js'
import type { OauthClientInfoDto, ConnectedAssistantDto } from './dto/assistenten.dto.js'

@Injectable()
export class AssistantsService {
  constructor(
    @Inject(ASSISTANT_REPOSITORY)
    private readonly repository: AssistantRepository,
    /** Every tool call leaves an audit row with the assistant: the newest is when it was last active (MCP-8). */
    @Optional() @Inject(AuditService) private readonly audit?: Pick<AuditService, 'lastSeenBySource'>,
  ) {}

  async listConnected(userId: string): Promise<ConnectedAssistantDto[]> {
    const list = await this.repository.findConnectedForUser(userId)
    // A JWT access token is not stored, so the token table alone never moved for standard clients.
    const seen = (await this.audit?.lastSeenBySource(userId, list.map((item) => assistantAuditSource(item.clientId)))) ?? new Map<string, Date>()
    return list.map((item) => {
      const fromAudit = seen.get(assistantAuditSource(item.clientId)) ?? null
      const lastUsed = [fromAudit, item.lastUsed].filter((date): date is Date => date !== null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null
      return {
        clientId: item.clientId,
        name: item.name,
        linkedSince: item.linkedSince.toISOString(),
        lastUsed: lastUsed?.toISOString() ?? null,
        scopes: [...(item.scopes ?? [])],
        // Two clients called "Claude" are told apart by where their access goes (Amendment 8).
        destinations: [...new Set((item.redirectUris ?? []).flatMap((uri) => redirectDestinationOf(uri) ?? []))],
      }
    })
  }

  async revoke(userId: string, clientId: string): Promise<void> {
    await this.repository.revokeForUser(userId, clientId)
  }

  async getClientInfo(clientId: string): Promise<OauthClientInfoDto | null> {
    const client = await this.repository.findClientInfo(clientId)
    if (!client) return null
    const { redirectUris, ...info } = client
    return {
      ...info,
      // A registered address that is no address cannot receive an approval; it is left out.
      redirectTargets: redirectUris.flatMap((uri) => {
        const destination = redirectDestinationOf(uri)
        return destination === null ? [] : [{ uri, destination }]
      }),
    }
  }
}
