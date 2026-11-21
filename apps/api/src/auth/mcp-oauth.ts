/**
 * Where an MCP client finds how to sign in (ADR-0052 §2, MCP authorization): the MCP endpoint is an
 * OAuth protected resource (RFC 9728) whose authorization server is better-auth under /api/auth.
 */
export const MCP_RESOURCE_PATH = '/mcp/sse'
/** The Streamable HTTP endpoint (ADR-0052 amendment 6): a resource of its own, so a client of /mcp accepts its metadata. */
export const MCP_STREAMABLE_PATH = '/mcp'
export const AUTH_BASE_PATH = '/api/auth'

const origin = (baseUrl: string): string => new URL(baseUrl).origin

/** The resource indicator (RFC 8707) a client asks a token for, and the audience of that token. */
export function mcpResourceUrl(baseUrl: string): string {
  return `${origin(baseUrl)}${MCP_RESOURCE_PATH}`
}

/** The resource of the Streamable HTTP endpoint; a client of /mcp asks its token for this one. */
export function mcpStreamableResourceUrl(baseUrl: string): string {
  return `${origin(baseUrl)}${MCP_STREAMABLE_PATH}`
}

/**
 * The audiences a token for the MCP endpoint may carry: both transports serve the same tools, so a token
 * issued for /mcp/sse (all tokens before amendment 6) is good on /mcp, and one for /mcp on /mcp/sse.
 */
export function mcpResourceUrls(baseUrl: string): string[] {
  return [mcpResourceUrl(baseUrl), mcpStreamableResourceUrl(baseUrl)]
}

/** The issuer of our access tokens: the same value the authorization-server metadata names. */
export function authIssuer(baseUrl: string): string {
  return `${origin(baseUrl)}${AUTH_BASE_PATH}`
}

/** RFC 9728 §3.1: the metadata URL for a resource with a path inserts the path after the well-known segment. */
export function protectedResourceMetadataUrl(baseUrl: string, resourcePath: string = MCP_RESOURCE_PATH): string {
  return `${origin(baseUrl)}/.well-known/oauth-protected-resource${resourcePath}`
}

/** The challenge of a 401 on the MCP endpoint, so a client can start the sign-in from it (RFC 6750, RFC 9728 §5.1). */
export function mcpBearerChallenge(baseUrl: string, resourcePath: string = MCP_RESOURCE_PATH): string {
  return `Bearer resource_metadata="${protectedResourceMetadataUrl(baseUrl, resourcePath)}"`
}
