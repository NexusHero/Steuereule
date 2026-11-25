export interface ConnectedAssistant {
  clientId: string
  name: string
  linkedSince: Date
  lastUsed: Date | null
  /** What the user granted, as stored with the consent. */
  scopes?: readonly string[]
  /** The redirect addresses the client registered: where its access went. */
  redirectUris?: readonly string[]
}

export interface ClientInfo {
  clientId: string
  name: string
  uri: string | null
  icon: string | null
  /** The redirect addresses the client registered: the only places an approval can send the access to. */
  redirectUris: readonly string[]
}

export const ASSISTANT_REPOSITORY = Symbol('ASSISTANT_REPOSITORY')

export interface AssistantRepository {
  findConnectedForUser(userId: string): Promise<ConnectedAssistant[]>
  revokeForUser(userId: string, clientId: string): Promise<void>
  findClientInfo(clientId: string): Promise<ClientInfo | null>
}
