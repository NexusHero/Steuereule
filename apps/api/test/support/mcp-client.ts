// The one way the MCP tests build the server's collaborators and talk to it: `McpDeps` from fakes plus what a
// test overrides, an in-memory client, and `call(name, args)` with the answer already read.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { AuditService } from '../../src/audit/audit.service.js'
import { createResettableRateLimitStorage } from '../../src/auth/rate-limit-storage.js'
import { inProcessKeyedLock } from '../../src/common/keyed-lock.js'
import { passThroughTransactionRunner } from '../../src/common/transaction-runner.js'
import { McpRateLimiter } from '../../src/mcp/mcp-rate-limit.js'
import type { AssistantSessionInfo, McpDeps, McpSession } from '../../src/mcp/mcp-session.js'
import { McpService } from '../../src/mcp/mcp.service.js'
import { UploadAdmission } from '../../src/receipt/upload-admission.js'
import { MCP_SCOPE } from '../../src/common/assistant-scopes.js'
import { installToolGate } from '../../src/mcp/tool-gate.js'
import { FakeAuditRepository } from '../fakes/fake-audit.repository.js'

/** An assistant granted every scope the endpoint advertises. */
export const ALL_SCOPES_ASSISTANT: AssistantSessionInfo = { clientId: 'client-test', clientName: 'Claude', scopes: Object.values(MCP_SCOPE) }

/** A collaborator the test did not give: using it fails the test by name instead of answering with nothing. */
function notGiven(name: string): never {
  return new Proxy(
    {},
    {
      get: (_target, method) => {
        if (method === 'then') return undefined
        return () => {
          throw new Error(`The test gave no McpDeps.${name}, but a tool called ${name}.${String(method)}().`)
        }
      },
    },
  ) as never
}

/** The upload admission of the REST route (ADR-0109), counting in this process. */
export const uploadAdmission = (): UploadAdmission => new UploadAdmission({ rateLimitStorage: createResettableRateLimitStorage({ redisUrl: '' }) } as never)

/**
 * The collaborators of the tools: what the test gives, an audit log, lock, transaction runner and upload
 * admission that work in memory, and for every other required one a stand-in that fails when a tool reaches it.
 */
export function mcpTestDeps(overrides: Partial<McpDeps> = {}): McpDeps {
  return {
    cockpit: notGiven('cockpit'),
    printout: notGiven('printout'),
    confirmation: notGiven('confirmation'),
    owlMode: notGiven('owlMode'),
    receipts: notGiven('receipts'),
    unlock: notGiven('unlock'),
    profiles: notGiven('profiles'),
    masterData: notGiven('masterData'),
    audit: new AuditService(new FakeAuditRepository()),
    locks: inProcessKeyedLock(),
    transactions: passThroughTransactionRunner,
    admission: uploadAdmission(),
    ...overrides,
  }
}

export interface McpTestOptions {
  readonly userId?: string
  readonly assistant?: AssistantSessionInfo
  readonly deps?: Partial<McpDeps>
  /** The limiter the gate counts in; give one to share it between connections or to set its limits. */
  readonly limiter?: McpRateLimiter
}

/** What a tool answered: the raw result, its first text, and that text as JSON (`body` throws when it is none). */
export interface ToolAnswer {
  readonly result: { readonly isError?: boolean; readonly content: readonly { readonly type: string; readonly text: string }[] }
  readonly isError: boolean
  readonly text: string
  readonly body: Record<string, any>
}

export interface McpTestClient {
  readonly client: Client
  call(name: string, args?: Record<string, unknown>): Promise<ToolAnswer>
}

/** An in-memory client connected to `server`. */
export async function connectMcpClient(server: McpServer): Promise<McpTestClient> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  const client = new Client({ name: 'TestClient', version: '1.0.0' })
  await client.connect(clientTransport)
  return {
    client,
    async call(name, args = {}) {
      const result = (await client.callTool({ name, arguments: args })) as ToolAnswer['result']
      const text = result.content[0]?.text ?? ''
      return {
        result,
        isError: result.isError === true,
        text,
        get body() {
          return JSON.parse(text) as Record<string, any>
        },
      }
    },
  }
}

/** `McpService` as the module builds it, over the test's collaborators. */
export function mcpTestService(options: Pick<McpTestOptions, 'deps' | 'limiter'> = {}): { service: McpService; deps: McpDeps; limiter: McpRateLimiter } {
  const deps = mcpTestDeps(options.deps)
  const limiter = options.limiter ?? new McpRateLimiter()
  return { service: new McpService(deps, limiter), deps, limiter }
}

/** The whole server with every tool group, connected: what an assistant sees. */
export async function connectMcpService(options: McpTestOptions = {}): Promise<McpTestClient & { readonly server: McpServer; readonly deps: McpDeps }> {
  const { service, deps } = mcpTestService(options)
  const server = service.createServer(options.userId ?? 'user-test', options.assistant ?? ALL_SCOPES_ASSISTANT)
  return { ...(await connectMcpClient(server)), server, deps }
}

/** A bare server behind the gate with only the tools `register` adds: one tool group, or stand-in handlers. */
export async function connectMcpTools(register: (session: McpSession, deps: McpDeps) => void, options: McpTestOptions = {}): Promise<McpTestClient & { readonly server: McpServer; readonly deps: McpDeps }> {
  const deps = mcpTestDeps(options.deps)
  const session: McpSession = { server: new McpServer({ name: 'test', version: '1.0.0' }), userId: options.userId ?? 'user-test', assistant: options.assistant ?? ALL_SCOPES_ASSISTANT }
  installToolGate(session.server, { userId: session.userId, assistant: session.assistant, limiter: options.limiter ?? new McpRateLimiter(), audit: deps.audit })
  register(session, deps)
  return { ...(await connectMcpClient(session.server)), server: session.server, deps }
}
