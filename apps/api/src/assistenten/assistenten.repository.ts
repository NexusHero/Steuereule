export interface ConnectedAssistant {
  clientId: string
  name: string
  verbundenSeit: Date
  connectedSince?: Date
  zuletztGenutzt: Date | null
  lastUsed?: Date | null
}

export interface ClientInfo {
  clientId: string
  name: string
  uri: string | null
  icon: string | null
}

export const ASSISTANT_REPOSITORY = Symbol('ASSISTANT_REPOSITORY')

export interface AssistantRepository {
  findConnectedForUser(userId: string): Promise<ConnectedAssistant[]>
  revokeForUser(userId: string, clientId: string): Promise<void>
  findClientInfo(clientId: string): Promise<ClientInfo | null>
}
