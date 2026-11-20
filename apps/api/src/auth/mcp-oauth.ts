/**
 * Where an MCP client finds how to sign in (ADR-0052 §2, MCP authorization): the MCP endpoint is an
 * OAuth protected resource (RFC 9728) whose authorization server is better-auth under /api/auth.
 */
export const MCP_RESOURCE_PATH = '/mcp/sse'
export const AUTH_BASE_PATH = '/api/auth'

const origin = (baseUrl: string): string => new URL(baseUrl).origin

/** The resource indicator (RFC 8707) a client asks a token for, and the audience of that token. */
export function mcpResourceUrl(baseUrl: string): string {
  return `${origin(baseUrl)}${MCP_RESOURCE_PATH}`
}

/** The issuer of our access tokens: the same value the authorization-server metadata names. */
export function authIssuer(baseUrl: string): string {
  return `${origin(baseUrl)}${AUTH_BASE_PATH}`
}

/** RFC 9728 §3.1: the metadata URL for a resource with a path inserts the path after the well-known segment. */
export function protectedResourceMetadataUrl(baseUrl: string): string {
  return `${origin(baseUrl)}/.well-known/oauth-protected-resource${MCP_RESOURCE_PATH}`
}

/** The challenge of a 401 on the MCP endpoint, so a client can start the sign-in from it (RFC 6750, RFC 9728 §5.1). */
export function mcpBearerChallenge(baseUrl: string): string {
  return `Bearer resource_metadata="${protectedResourceMetadataUrl(baseUrl)}"`
}
