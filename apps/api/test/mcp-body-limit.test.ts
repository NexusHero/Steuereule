// Beta P4, decision 6: the MCP message routes take up to 15 MB (a receipt as base64), and only from an assistant
// with a valid token. Fastify buffers the body before any Nest guard runs, so the token is checked before the
// body is read: a header that merely starts with "Bearer " must not make the server buffer 15 MB.
import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_BODY_LIMIT_BYTES, installMcpBodyLimit, MCP_BODY_LIMIT_BYTES } from '../src/mcp/mcp-body-limit.js'
import { UserContextGuard } from '../src/auth/user-context.guard.js'

const CHALLENGE = 'Bearer resource_metadata="https://api.example.test/.well-known/oauth-protected-resource/mcp"'

async function server(check: (authorization: string | undefined) => string | null) {
  const app = Fastify()
  const bearerBeforeBody = vi.fn(async (request: { headers: { authorization?: string } }) => check(request.headers.authorization))
  installMcpBodyLimit(app, bearerBeforeBody as never)
  const handled = vi.fn()
  app.post('/mcp', (request, reply) => {
    handled()
    void reply.send({ size: JSON.stringify(request.body).length })
  })
  await app.ready()
  return { app, bearerBeforeBody, handled }
}

const big = () => JSON.stringify({ jsonrpc: '2.0', params: { data: 'A'.repeat(DEFAULT_BODY_LIMIT_BYTES + 10) } })

describe('the MCP body limit', () => {
  it('a small message passes without a check here; the guard decides it after the body is read', async () => {
    const { app, bearerBeforeBody, handled } = await server(() => CHALLENGE)
    const response = await app.inject({ method: 'POST', url: '/mcp', payload: { jsonrpc: '2.0' } })
    expect(response.statusCode).toBe(200)
    expect(bearerBeforeBody).not.toHaveBeenCalled()
    expect(handled).toHaveBeenCalledOnce()
  })

  it('a large message with a token that does not pass is answered 401 with the challenge, before the handler', async () => {
    const { app, handled } = await server((authorization) => (authorization === 'Bearer good' ? null : `${CHALLENGE}, error="invalid_token"`))
    const response = await app.inject({ method: 'POST', url: '/mcp', headers: { authorization: 'Bearer x', 'content-type': 'application/json' }, payload: big() })
    expect(response.statusCode).toBe(401)
    expect(response.headers['www-authenticate']).toContain('invalid_token')
    expect(response.json()).toMatchObject({ code: 'MCP_BEARER_REQUIRED' })
    expect(handled).not.toHaveBeenCalled()
  })

  it('a large message without any token is answered 401', async () => {
    const { app, handled } = await server(() => CHALLENGE)
    const response = await app.inject({ method: 'POST', url: '/mcp', headers: { 'content-type': 'application/json' }, payload: big() })
    expect(response.statusCode).toBe(401)
    expect(response.headers['www-authenticate']).toBe(CHALLENGE)
    expect(handled).not.toHaveBeenCalled()
  })

  it('a large message with a valid token is read, up to the MCP limit', async () => {
    const { app, handled } = await server((authorization) => (authorization === 'Bearer good' ? null : CHALLENGE))
    const response = await app.inject({ method: 'POST', url: '/mcp', headers: { authorization: 'Bearer good', 'content-type': 'application/json' }, payload: big() })
    expect(response.statusCode).toBe(200)
    expect(handled).toHaveBeenCalledOnce()
    expect(MCP_BODY_LIMIT_BYTES).toBe(15 * 1024 * 1024)
  })
})

describe('UserContextGuard.refuseBearerBeforeBody', () => {
  const bundle = { auth: { options: { baseURL: 'https://api.example.test' } } } as never
  const request = (authorization?: string) => ({ url: '/mcp', headers: authorization === undefined ? {} : { authorization } }) as never

  it('refuses a missing token and an unknown one with the challenge, and lets a valid one pass', async () => {
    const record = { userId: 'u', clientId: 'c', scopes: [], expiresAt: null, revoked: null, client: { clientId: 'c', name: 'Claude', disabled: false } }
    const tokens = {
      findOpaqueToken: vi.fn(async () => record),
      hasConsent: vi.fn(async () => true),
      findClient: vi.fn(),
    }
    const guard = new UserContextGuard(bundle, tokens as never)
    expect(await guard.refuseBearerBeforeBody(request())).toMatch(/^Bearer /)
    expect(await guard.refuseBearerBeforeBody(request('Bearer good'))).toBeNull()
    tokens.findOpaqueToken.mockResolvedValueOnce(null as never)
    expect(await guard.refuseBearerBeforeBody(request('Bearer unknown'))).toContain('error="invalid_token"')
  })
})
