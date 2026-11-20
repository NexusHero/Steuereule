import { describe, expect, it, vi } from 'vitest'

const metadataHandler = vi.fn(async (request: Request) => new Response(JSON.stringify({ issuer: 'http://localhost:3501/api/auth', asked: request.url }), { status: 200, headers: { 'content-type': 'application/json' } }))
vi.mock('@better-auth/oauth-provider', () => ({ oauthProviderAuthServerMetadata: () => metadataHandler }))

const { OAuthDiscoveryController } = await import('../src/auth/oauth-discovery.controller.js')

const controller = () => new OAuthDiscoveryController({ auth: { options: { baseURL: 'http://localhost:3501' } } } as never)

describe('OAuth discovery for MCP clients (ADR-0052 §2, RFC 9728, RFC 8414)', () => {
  it('describes the MCP endpoint as a protected resource of our authorization server', () => {
    expect(controller().protectedResource()).toEqual({
      resource: 'http://localhost:3501/mcp/sse',
      authorization_servers: ['http://localhost:3501/api/auth'],
      scopes_supported: ['openid', 'steuerdaten:read', 'steuerdaten:write', 'belege:write', 'zahllink:read', 'offline_access'],
      bearer_methods_supported: ['header'],
      resource_name: 'SteuerEule',
    })
  })

  it('serves the authorization-server metadata at the root, where clients look for it', async () => {
    const reply = { status: vi.fn().mockReturnThis(), header: vi.fn().mockReturnThis(), send: vi.fn() }
    await controller().authorizationServer({ url: '/.well-known/oauth-authorization-server/api/auth' } as never, reply as never)
    expect(reply.status).toHaveBeenCalledWith(200)
    expect(JSON.parse(reply.send.mock.calls[0]![0] as string)).toMatchObject({ issuer: 'http://localhost:3501/api/auth' })
  })
})
