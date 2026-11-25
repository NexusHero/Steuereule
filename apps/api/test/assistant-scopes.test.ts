import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { OAUTH_SCOPES } from '../src/auth/better-auth.js'
import { ASSISTANT_SCOPES, hasScope, LEGACY_PAYMENT_SCOPE, MCP_SCOPE } from '../src/common/assistant-scopes.js'
import { TOOL_POLICIES } from '../src/mcp/tool-policies.js'

const webFile = (path: string) => readFileSync(fileURLToPath(new URL(`../../mobile-web/src/${path}`, import.meta.url)), 'utf8')
const quotedScopes = (text: string) => new Set([...text.matchAll(/'([a-z]+:(?:read|write))'/g)].map((match) => match[1]!))

/** The assistant scopes have one definition: the authorization server issues what the MCP gate checks (ADR-0052 §10). */
describe('the assistant scopes come from one place', () => {
  it('the authorization server knows every scope a tool needs, and the old payment scope', () => {
    expect(OAUTH_SCOPES).toEqual(['openid', ...ASSISTANT_SCOPES, LEGACY_PAYMENT_SCOPE, 'offline_access'])
    for (const [tool, policy] of Object.entries(TOOL_POLICIES)) expect(ASSISTANT_SCOPES, tool).toContain(policy.scope)
  })

  it('the old payment scope still opens the payment tool, and only that one', () => {
    expect(hasScope({ scopes: [LEGACY_PAYMENT_SCOPE] }, MCP_SCOPE.payment)).toBe(true)
    for (const scope of [MCP_SCOPE.read, MCP_SCOPE.write, MCP_SCOPE.receipts]) expect(hasScope({ scopes: [LEGACY_PAYMENT_SCOPE] }, scope)).toBe(false)
  })

  it('the web app names a label for every scope the server issues, and no other', () => {
    const issued = [...ASSISTANT_SCOPES, LEGACY_PAYMENT_SCOPE].sort()
    expect([...quotedScopes(webFile('screens/profile/AssistentenListSection.tsx'))].sort()).toEqual(issued)
    expect([...quotedScopes(webFile('screens/oauth/OauthConsentScreen.tsx'))].sort()).toEqual(issued)
  })
})
