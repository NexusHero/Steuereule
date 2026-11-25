// The lock of beta P4: every tool the MCP server registers, booted in-process with every optional service, is
// checked for the same contract — a policy with a declared scope that the gate enforces, bounded arguments and a
// bounded `taxYear`, annotations, every failure as `isError` with a code and a next step (never an internal
// message), and an audit row that names the assistant. A new tool that misses one of them fails here.
import { describe, expect, it } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { z } from 'zod'
import { AuditService } from '../src/audit/audit.service.js'
import { inProcessKeyedLock } from '../src/common/keyed-lock.js'
import { passThroughTransactionRunner } from '../src/common/transaction-runner.js'
import { MCP_TOOL_BUDGETS, McpRateLimiter, type ToolBudget } from '../src/mcp/mcp-rate-limit.js'
import type { AssistantSessionInfo, McpDeps } from '../src/mcp/mcp-session.js'
import { MCP_SCOPE } from '../src/common/assistant-scopes.js'
import { MIN_TAX_YEAR, maxTaxYear, unboundedArguments } from '../src/mcp/tool-args.js'
import { annotationsOf, TOOL_POLICIES } from '../src/mcp/tool-policies.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'
import { connectMcpClient, mcpTestService } from './support/mcp-client.js'

const USER = 'user-contract'
const SECRET = 'relation "Kennzeichnung" violates constraint at /srv/app/node_modules/.prisma'

/** A service whose every method fails the way a database does: what a tool must never pass on. */
function failing(): never {
  return new Proxy(
    {},
    {
      get: (_target, prop) => (prop === 'then' ? undefined : async () => Promise.reject(new Error(SECRET))),
    },
  ) as never
}

/** Every collaborator from `stand(name)`, with a real audit log, lock and transaction runner: every tool group registers. */
function everyDep(stand: (name: keyof McpDeps) => never, audit: AuditService): Required<McpDeps> {
  return {
    cockpit: stand('cockpit'),
    printout: stand('printout'),
    confirmation: stand('confirmation'),
    owlMode: stand('owlMode'),
    receipts: stand('receipts'),
    unlock: stand('unlock'),
    profiles: stand('profiles'),
    masterData: stand('masterData'),
    audit,
    locks: inProcessKeyedLock(),
    transactions: passThroughTransactionRunner,
    admission: { acquire: () => () => undefined },
    report: stand('report'),
    link: stand('link'),
    children: stand('children'),
    deadlines: stand('deadlines'),
    rentals: stand('rentals'),
    tasks: stand('tasks'),
    business: stand('business'),
    years: stand('years'),
  }
}

const boot = (audit: AuditService) => mcpTestService({ deps: everyDep(failing, audit) }).service

/**
 * A collaborator that answers every call and notes it as `name.method` in `seen`: what a tool reaches, whatever
 * it then does with the answer.
 */
function recording(path: string, seen: Set<string>): never {
  return new Proxy(() => undefined, {
    get: (_target, prop) => (prop === 'then' || typeof prop === 'symbol' ? undefined : recording(`${path}.${prop}`, seen)),
    apply: () => {
      seen.add(path)
      return Promise.resolve(recording(`${path}()`, seen))
    },
  }) as never
}

/** The operations that cost more than a call, and the budget a tool reaching one has to name. */
const BUDGETED_OPERATIONS: Readonly<Record<string, ToolBudget>> = {
  'unlock.startCheckout': 'checkoutLink',
  'receipts.upload': 'receiptUpload',
  'printout.check': 'printout',
  // Both render the printout through `PrintoutService.check`.
  'report.report': 'printout',
  'report.check': 'printout',
}

/** The server over recording collaborators: which of them a call reached is in `seen` afterwards. */
const bootRecording = (seen: Set<string>, limiter: McpRateLimiter) =>
  mcpTestService({ deps: everyDep((name) => recording(name, seen), new AuditService(new FakeAuditRepository())), limiter }).service

/** Arguments that take a tool past its own checks to its collaborators: a year and a file. */
const REACHING_ARGS = { taxYear: 2025, dateiBase64: Buffer.from('%PDF-1.4\n%%EOF').toString('base64'), fileName: 'beleg.pdf' }

type Registered = { inputSchema?: z.ZodObject<Record<string, z.ZodType>>; handler: (args: Record<string, unknown>, extra: unknown) => Promise<{ isError?: boolean; content: { text: string }[] }> }
const registeredTools = (server: McpServer) => (server as unknown as { _registeredTools: Record<string, Registered> })._registeredTools

const ALL: AssistantSessionInfo = { clientId: 'client-contract', clientName: 'Contract', scopes: Object.values(MCP_SCOPE) }

describe('MCP tool contract (beta P4 lock)', () => {
  const audit = new AuditService(new FakeAuditRepository())
  const tools = registeredTools(boot(audit).createServer(USER, ALL))
  const names = Object.keys(tools).sort()

  it('registers every tool of the table, and only those', () => {
    expect(names.length).toBeGreaterThanOrEqual(48)
    expect(names).toEqual(Object.keys(TOOL_POLICIES).sort())
  })

  it('every argument is bounded, and every tax year lies in the range the REST routes take', () => {
    for (const name of names) {
      const shape = tools[name]!.inputSchema?.shape ?? {}
      expect(unboundedArguments(shape), name).toEqual([])
      for (const key of ['taxYear', 'year']) {
        const year = shape[key] as unknown as { minValue?: number; maxValue?: number; unwrap?: () => { minValue?: number; maxValue?: number } } | undefined
        if (year === undefined) continue
        const inner = year.minValue === undefined && year.unwrap ? year.unwrap() : year
        expect([inner.minValue, inner.maxValue], `${name}.${key}`).toEqual([MIN_TAX_YEAR, maxTaxYear()])
      }
    }
  })

  it('every tool publishes its annotations and a title', async () => {
    const { client } = await connectMcpClient(boot(audit).createServer(USER, ALL))
    const listed = (await client.listTools()).tools
    expect(listed.map((t) => t.name).sort()).toEqual(names)
    for (const tool of listed) {
      expect(tool.annotations, tool.name).toEqual(annotationsOf(TOOL_POLICIES[tool.name]!))
      expect(tool.description?.length ?? 0, tool.name).toBeGreaterThan(20)
    }
    // The workflow on initialize (MCP-10).
    expect(client.getInstructions()).toContain('steuerjahre_auflisten')
  })

  it('every tool refuses an assistant without its scope, says which scope and how to get it, and audits the call with the assistant', async () => {
    const repository = new FakeAuditRepository()
    const none: AssistantSessionInfo = { clientId: 'client-none', clientName: 'None', scopes: [] }
    const server = boot(new AuditService(repository)).createServer(USER, none)
    for (const [name, tool] of Object.entries(registeredTools(server))) {
      const result = await tool.handler({}, {})
      expect(result.isError, name).toBe(true)
      const body = JSON.parse(result.content[0]!.text) as { code: string; error: string; naechsterSchritt: string }
      expect(body.code, name).toBe('MISSING_SCOPE')
      expect(body.error, name).toContain(TOOL_POLICIES[name]!.scope)
      expect(body.naechsterSchritt, name).toContain('Berechtigung')
      expect(repository.all().filter((row) => row.resource === name), name).toEqual([expect.objectContaining({ source: 'assistent:client-none' })])
    }
  })

  it('every failure is isError with a code and a next step, and no internal message reaches the assistant', async () => {
    const repository = new FakeAuditRepository()
    const server = boot(new AuditService(repository)).createServer(USER, ALL)
    let refusals = 0
    for (const [name, tool] of Object.entries(registeredTools(server))) {
      // Past the schema on purpose: the services below fail like a database, the arguments are empty.
      const result = await tool.handler({ taxYear: 2025 }, {})
      const text = result.content.map((c) => c.text).join('\n')
      expect(text, name).not.toContain('Kennzeichnung')
      expect(text, name).not.toContain('node_modules')
      if (result.isError === true) {
        refusals += 1
        const body = JSON.parse(result.content[0]!.text) as { ok: boolean; code: string; naechsterSchritt: string }
        expect(body.ok, name).toBe(false)
        expect(body.code, name).toMatch(/^[A-Z][A-Z0-9_]+$/)
        expect(body.naechsterSchritt.length, name).toBeGreaterThan(10)
      } else {
        expect(text, name).not.toContain('"ok": false')
      }
      expect(repository.all().some((row) => row.resource === name && row.source === 'assistent:client-contract'), name).toBe(true)
    }
    // Every tool that reads or writes user data fails here; only the pure advice tools can answer.
    expect(refusals).toBeGreaterThanOrEqual(names.length - 12)
  })

  it('arguments the schema refuses come back in the same shape, through the protocol', async () => {
    const { client } = await connectMcpClient(boot(audit).createServer(USER, ALL))
    for (const name of names.filter((n) => tools[n]!.inputSchema?.shape.taxYear !== undefined)) {
      for (const taxYear of [0, 9999]) {
        const result = (await client.callTool({ name, arguments: { taxYear } })) as { isError?: boolean; content: { text: string }[] }
        expect(result.isError, `${name} ${taxYear}`).toBe(true)
        expect(JSON.parse(result.content[0]!.text), `${name} ${taxYear}`).toMatchObject({ ok: false, code: 'INVALID_ARGUMENTS' })
      }
    }
    const unknown = (await client.callTool({ name: 'gibt_es_nicht', arguments: {} })) as { content: { text: string }[] }
    expect(JSON.parse(unknown.content[0]!.text)).toMatchObject({ code: 'UNKNOWN_TOOL' })
  })

  it('a tool reaches a budgeted operation (checkout session, stored file, rendered printout) exactly when its policy names that budget', async () => {
    const budgetsReached = new Set<ToolBudget>()
    for (const name of names) {
      const seen = new Set<string>()
      await registeredTools(bootRecording(seen, new McpRateLimiter()).createServer(USER, ALL))[name]!.handler(REACHING_ARGS, {})
      const reached = [...new Set([...seen].flatMap((operation) => BUDGETED_OPERATIONS[operation] ?? []))]
      const declared = TOOL_POLICIES[name]!.budget
      expect(reached, name).toEqual(declared === undefined ? [] : [declared])
      for (const budget of reached) budgetsReached.add(budget)
    }
    // Every budget the limiter knows is covered by an operation above, so none can go unwatched.
    expect([...budgetsReached].sort()).toEqual(Object.keys(MCP_TOOL_BUDGETS).sort())
  })

  it('a tool whose budget is used up is refused before it reaches the budgeted operation', async () => {
    const budgeted = names.filter((name) => TOOL_POLICIES[name]!.budget !== undefined)
    expect(budgeted.length).toBeGreaterThanOrEqual(5)
    for (const name of budgeted) {
      const budget = TOOL_POLICIES[name]!.budget!
      const limiter = new McpRateLimiter()
      for (let i = 0; i < MCP_TOOL_BUDGETS[budget].max; i += 1) await limiter.takeBudget(budget, USER)
      const seen = new Set<string>()
      const result = await registeredTools(bootRecording(seen, limiter).createServer(USER, ALL))[name]!.handler(REACHING_ARGS, {})
      expect(result.isError, name).toBe(true)
      expect((JSON.parse(result.content[0]!.text) as { code: string }).code, name).toMatch(/^(RATE_LIMITED|PRINTOUT_BUDGET)$/)
      expect([...seen].filter((operation) => operation in BUDGETED_OPERATIONS), name).toEqual([])
    }
  })
})
