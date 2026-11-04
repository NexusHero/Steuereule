import type {
  AssistentenRepository,
  ClientInfo,
  VerbundenerAssistent,
} from '../../src/assistenten/assistenten.repository.js'

export class FakeAssistentenRepository implements AssistentenRepository {
  private connected: Map<string, VerbundenerAssistent[]> = new Map()
  private clients: Map<string, ClientInfo> = new Map()

  setConnected(userId: string, list: VerbundenerAssistent[]): void {
    this.connected.set(userId, [...list])
  }

  setClient(info: ClientInfo): void {
    this.clients.set(info.clientId, info)
  }

  async findConnectedForUser(userId: string): Promise<VerbundenerAssistent[]> {
    return this.connected.get(userId) ?? []
  }

  async revokeForUser(userId: string, clientId: string): Promise<void> {
    const list = this.connected.get(userId) ?? []
    this.connected.set(
      userId,
      list.filter((item) => item.clientId !== clientId),
    )
  }

  async findClientInfo(clientId: string): Promise<ClientInfo | null> {
    return this.clients.get(clientId) ?? null
  }
}
