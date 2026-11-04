export interface VerbundenerAssistent {
  clientId: string
  name: string
  verbundenSeit: Date
  zuletztGenutzt: Date | null
}

export interface ClientInfo {
  clientId: string
  name: string
  uri: string | null
  icon: string | null
}

export const ASSISTENTEN_REPOSITORY = Symbol('ASSISTENTEN_REPOSITORY')

export interface AssistentenRepository {
  findConnectedForUser(userId: string): Promise<VerbundenerAssistent[]>
  revokeForUser(userId: string, clientId: string): Promise<void>
  findClientInfo(clientId: string): Promise<ClientInfo | null>
}
