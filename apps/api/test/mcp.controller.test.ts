import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { HttpException, UnauthorizedException } from '@nestjs/common'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { AUTH_CONTEXT_REQUEST_KEY, USER_ID_REQUEST_KEY } from '../src/auth/user-context.guard.js'
import { AuditService } from '../src/audit/audit.service.js'
import { McpController } from '../src/mcp/mcp.controller.js'
import { McpRateLimiter } from '../src/mcp/mcp-rate-limit.js'
import { McpService } from '../src/mcp/mcp.service.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'

const BASE = 'http://localhost:3501'
const bundle = { auth: { options: { baseURL: BASE } } } as never

function controller() {
  return new McpController({ createServer: vi.fn() } as never, bundle)
}

describe('McpController sign-in challenge (ADR-0052 §2, RFC 9728 §5.1)', () => {
  it('answers a request without an assistant token with 401 and points to the protected-resource metadata', async () => {
    const reply = { header: vi.fn(), hijack: vi.fn() }
    const request = { [USER_ID_REQUEST_KEY]: 'guest-1', [AUTH_CONTEXT_REQUEST_KEY]: { source: 'nutzer' } }
    await expect(controller().sse(request as never, reply as never)).rejects.toBeInstanceOf(UnauthorizedException)
    expect(reply.header).toHaveBeenCalledWith('WWW-Authenticate', `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp/sse"`)
    expect(reply.hijack).not.toHaveBeenCalled()
  })

  it('does the same on the message endpoint', async () => {
    const reply = { header: vi.fn(), hijack: vi.fn(), raw: {} }
    const request = { [AUTH_CONTEXT_REQUEST_KEY]: { source: 'nutzer' }, query: {} }
    await expect(controller().messages(request as never, reply as never)).rejects.toBeInstanceOf(UnauthorizedException)
    expect(reply.header).toHaveBeenCalledWith('WWW-Authenticate', expect.stringContaining('resource_metadata='))
  })

  it('does the same on the Streamable HTTP endpoint, pointing to the metadata of /mcp', async () => {
    const reply = { header: vi.fn(), hijack: vi.fn(), raw: {} }
    const request = { [USER_ID_REQUEST_KEY]: 'guest-1', [AUTH_CONTEXT_REQUEST_KEY]: { source: 'nutzer' }, body: {} }
    await expect(controller().streamable(request as never, reply as never)).rejects.toBeInstanceOf(UnauthorizedException)
    expect(reply.header).toHaveBeenCalledWith('WWW-Authenticate', `Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp"`)
    expect(reply.hijack).not.toHaveBeenCalled()
  })
})

describe('McpController limits (ADR-0052 amendment 6)', () => {
  it('opens at most three SSE sessions per user and refuses the fourth with 429 before taking the reply', async () => {
    const limiter = new McpRateLimiter()
    for (const id of ['a', 'b', 'c']) limiter.openSession('user-1', id)
    const audit = new FakeAuditRepository()
    const mcp = { createServer: vi.fn() }
    const ctl = new McpController(mcp as never, bundle, limiter, new AuditService(audit))
    const reply = { header: vi.fn(), hijack: vi.fn(), raw: { writeHead: vi.fn(), write: vi.fn(), on: vi.fn() } }
    const request = { [USER_ID_REQUEST_KEY]: 'user-1', [AUTH_CONTEXT_REQUEST_KEY]: { source: 'assistent', clientId: 'c', clientName: 'Claude', scopes: [] } }
    const refused = await ctl.sse(request as never, reply as never).catch((error: unknown) => error)
    expect(refused).toBeInstanceOf(HttpException)
    expect((refused as HttpException).getStatus()).toBe(429)
    expect(String((refused as HttpException).message)).toContain('höchstens 3')
    expect(reply.hijack).not.toHaveBeenCalled()
    expect(mcp.createServer).not.toHaveBeenCalled()
    expect(audit.all().map((e) => e.resource)).toEqual(['mcp_sessions_limited'])
  })
})

// ADR-0052 amendment 9: the server behind an SSE session carries the scopes of the client that opened it.
// Another assistant of the same user, granted less, could send to it with the session id.
describe('McpController SSE sessions belong to the client that opened them', () => {
  const requestOf = (clientId: string, query?: object) => ({ [USER_ID_REQUEST_KEY]: 'user-1', [AUTH_CONTEXT_REQUEST_KEY]: { source: 'assistent', clientId, clientName: 'Claude', scopes: [] }, query })
  const replyOf = () => ({ header: vi.fn(), hijack: vi.fn(), raw: { writeHead: vi.fn().mockReturnThis(), write: vi.fn(), end: vi.fn(), on: vi.fn() } })

  it('refuses a message from another client of the same user with 403, and takes the opener\'s', async () => {
    const connect = vi.fn()
    const ctl = new McpController({ createServer: () => ({ connect }) } as never, bundle, new McpRateLimiter())
    await ctl.sse(requestOf('client-a') as never, replyOf() as never)
    const sessionId = [...(ctl as unknown as { sessions: Map<string, unknown> }).sessions.keys()][0]!

    const foreign = replyOf()
    await ctl.messages(requestOf('client-b', { sessionId }) as never, foreign as never)
    expect(foreign.raw.writeHead).toHaveBeenCalledWith(403, { 'Content-Type': 'text/plain' })
    expect(foreign.raw.end).toHaveBeenCalledWith('Session belongs to another assistant')
    expect(foreign.hijack).not.toHaveBeenCalled()

    const own = replyOf()
    await ctl.messages(requestOf('client-a', { sessionId }) as never, own as never).catch(() => undefined)
    expect(own.hijack).toHaveBeenCalled()
  })
})

describe('McpController Streamable HTTP (stateless, POST /mcp)', () => {
  let http: Server | null = null
  afterEach(async () => {
    await new Promise<void>((resolve) => (http ? http.close(() => resolve()) : resolve()))
    http = null
  })

  /** A Node server that hands each request to the controller as Fastify would, with the assistant context the guard sets. */
  async function serve(ctl: McpController, authContext: object | undefined): Promise<URL> {
    http = createServer((req: IncomingMessage, res: ServerResponse) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        const request = { raw: req, body: text === '' ? undefined : JSON.parse(text), headers: req.headers, [USER_ID_REQUEST_KEY]: authContext ? 'user-1' : undefined, [AUTH_CONTEXT_REQUEST_KEY]: authContext }
        const reply = { raw: res, hijack: vi.fn(), header: (name: string, value: string) => res.setHeader(name, value) }
        const route = req.method === 'POST' ? ctl.streamable(request as never, reply as never) : ctl.streamableOther(reply as never)
        route.catch((error: unknown) => {
          const status = error instanceof HttpException ? error.getStatus() : 500
          if (!res.headersSent) res.writeHead(status, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ message: error instanceof Error ? error.message : 'error' }))
        })
      })
    })
    await new Promise<void>((resolve) => http!.listen(0, '127.0.0.1', () => resolve()))
    return new URL(`http://127.0.0.1:${(http!.address() as AddressInfo).port}/mcp`)
  }

  function realService(audit: AuditService, limiter: McpRateLimiter): McpService {
    const none = {} as never
    return new McpService(none, none, none, none, none, none, none, none, audit, undefined, undefined, undefined, undefined, undefined, undefined, undefined, limiter)
  }

  const ASSISTANT = { source: 'assistent', clientId: 'client-claude', clientName: 'Claude', scopes: ['steuerdaten:read'] }

  it('initializes and calls a tool over the new endpoint, each request with a fresh server', async () => {
    const audit = new FakeAuditRepository()
    const auditService = new AuditService(audit)
    const ctl = new McpController(realService(auditService, new McpRateLimiter()), bundle, new McpRateLimiter(), auditService)
    const url = await serve(ctl, ASSISTANT)
    const client = new Client({ name: 'TestClient', version: '1.0.0' })
    await client.connect(new StreamableHTTPClientTransport(url))
    const tools = await client.listTools()
    expect(tools.tools.map((t) => t.name)).toContain('wechselkurs')
    const res = await client.callTool({ name: 'wechselkurs', arguments: { taxYear: 2024 } })
    expect(JSON.parse((res as { content: { text: string }[] }).content[0]!.text)).toMatchObject({ ok: true, taxYear: 2024 })
    expect(audit.all().map((e) => e.resource)).toContain('wechselkurs')
    await client.close()
  })

  it('holds the tool-call limit on the new endpoint too', async () => {
    const auditService = new AuditService(new FakeAuditRepository())
    const limiter = new McpRateLimiter(Date.now, { toolCallsPerMinute: 1, openSessionsPerUser: 3 })
    const ctl = new McpController(realService(auditService, limiter), bundle, limiter, auditService)
    const client = new Client({ name: 'TestClient', version: '1.0.0' })
    await client.connect(new StreamableHTTPClientTransport(await serve(ctl, ASSISTANT)))
    await client.callTool({ name: 'wechselkurs', arguments: { taxYear: 2024 } })
    const refused = await client.callTool({ name: 'wechselkurs', arguments: { taxYear: 2024 } })
    expect((refused as { isError?: boolean }).isError).toBe(true)
    expect((refused as { content: { text: string }[] }).content[0]!.text).toContain('RATE_LIMITED')
    await client.close()
  })

  it('answers 401 with the challenge without an assistant token', async () => {
    const ctl = new McpController({ createServer: vi.fn() } as never, bundle)
    const url = await serve(ctl, undefined)
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toBe(`Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp"`)
  })

  it('answers GET and DELETE on /mcp with 405: the stateless endpoint keeps no stream and no session', async () => {
    const ctl = new McpController({ createServer: vi.fn() } as never, bundle)
    const url = await serve(ctl, ASSISTANT)
    expect((await fetch(url, { method: 'GET' })).status).toBe(405)
    expect((await fetch(url, { method: 'DELETE' })).status).toBe(405)
  })
})
