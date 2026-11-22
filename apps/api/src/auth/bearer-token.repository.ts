/**
 * Port for the OAuth rows the request guard reads to accept an assistant's bearer token
 * (ADR-0052). The guard decides; this port only looks up. The Prisma adapter is
 * `bearer-token.repository.prisma.ts`.
 */
export interface BearerTokenRepository {
  /** The opaque access token stored under this SHA-256 hash (base64url), with its client. */
  findOpaqueToken(tokenHash: string): Promise<OpaqueAccessToken | null>
  /** The registered OAuth client, whatever its state. */
  findClient(clientId: string): Promise<AssistantClient | null>
  /** Whether the user still consents to the client: revoking a connection deletes the consent. */
  hasConsent(userId: string, clientId: string): Promise<boolean>
}

export interface AssistantClient {
  readonly name: string | null
  readonly disabled: boolean
}

export interface OpaqueAccessToken {
  readonly userId: string | null
  readonly clientId: string
  readonly scopes: readonly string[]
  readonly revoked: Date | null
  readonly expiresAt: Date | null
  readonly client: AssistantClient | null
}

export const BEARER_TOKEN_REPOSITORY = Symbol('BEARER_TOKEN_REPOSITORY')
