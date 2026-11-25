/**
 * The OAuth scopes an assistant can be granted (ADR-0052 §10): one definition for the authorization server
 * (`auth/better-auth.ts` offers and issues them) and the MCP gate (`mcp/tool-policies.ts` checks them).
 */

/** What an assistant may be granted (the OAuth scopes the MCP endpoint knows). */
export const MCP_SCOPE = {
  read: 'steuerdaten:read',
  write: 'steuerdaten:write',
  receipts: 'belege:write',
  payment: 'zahllink:write',
} as const

export type McpScope = (typeof MCP_SCOPE)[keyof typeof MCP_SCOPE]

/** The assistant scopes in the order the consent page lists them. */
export const ASSISTANT_SCOPES = [MCP_SCOPE.read, MCP_SCOPE.write, MCP_SCOPE.receipts, MCP_SCOPE.payment] as const

/**
 * The payment scope before beta P4 (H2-21): a read scope for a tool that opens a checkout session. Grants made
 * with it still hold (their refresh tokens carry it), so it is accepted for `zahllink_anfordern` as before; new
 * grants are offered `zahllink:write` only. It can be dropped once no refresh token with it is left.
 */
export const LEGACY_PAYMENT_SCOPE = 'zahllink:read'

/** A grant that satisfies a scope: the scope itself, and for the payment scope its name before beta P4. */
const ACCEPTED_FOR: Readonly<Record<McpScope, readonly string[]>> = {
  [MCP_SCOPE.read]: [MCP_SCOPE.read],
  [MCP_SCOPE.write]: [MCP_SCOPE.write],
  [MCP_SCOPE.receipts]: [MCP_SCOPE.receipts],
  [MCP_SCOPE.payment]: [MCP_SCOPE.payment, LEGACY_PAYMENT_SCOPE],
}

export function hasScope(assistant: { readonly scopes: readonly string[] }, scope: McpScope): boolean {
  return ACCEPTED_FOR[scope].some((granted) => assistant.scopes.includes(granted))
}
