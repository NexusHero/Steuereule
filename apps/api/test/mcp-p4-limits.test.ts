// Beta P4: the caps of the creating tools hold when calls arrive together, a create commits with its mark,
// the printout-rendering tools have a budget of their own, and the smaller usability fixes.
import { describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { containsLink } from '../src/assistant-task/assistant-task.service.js'
import { AssistantTaskService } from '../src/assistant-task/assistant-task.service.js'
import { assistantAuditSource, runWithAuditSource } from '../src/audit/audit-source.js'
import { AuditService } from '../src/audit/audit.service.js'
import { clientDisplayName, isAcceptableClientName } from '../src/auth/oauth-client-name.js'
import { inProcessKeyedLock } from '../src/common/keyed-lock.js'
import { passThroughTransactionRunner } from '../src/common/transaction-runner.js'
import { MCP_PRINTOUT_CHECK_LIMIT, McpRateLimiter } from '../src/mcp/mcp-rate-limit.js'
import type { AssistantSessionInfo, McpDeps } from '../src/mcp/mcp-session.js'
import { installToolGate, MCP_SCOPE, normalisedResult } from '../src/mcp/tool-kit.js'
import { MAX_CHILDREN_BY_ASSISTANT, registerChildTools } from '../src/mcp/tools/child-tools.js'
import { registerComfortTools } from '../src/mcp/tools/comfort-tools.js'
import { MAX_RENTAL_OBJECTS_BY_ASSISTANT, registerRentalTools } from '../src/mcp/tools/rental-tools.js'
import { registerReportTools, registerStatusTools } from '../src/mcp/tools/status-tools.js'
import { registerTaskTools } from '../src/mcp/tools/task-tools.js'
import { FakeAssistantTaskRepository } from './fakes/fake-assistant-task.repository.js'
import { FakeAuditRepository } from './fakes/fake-audit.repository.js'

const USER = 'u-p4'
const YEAR = 2025
const ASSISTANT: AssistantSessionInfo = { clientId: 'client-p4', clientName: 'Claude', scopes: [MCP_SCOPE.read, MCP_SCOPE.write, MCP_SCOPE.payment] }
/** One turn of the event loop: enough for two calls in flight to interleave between their read and their write. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

async function connect(register: (server: McpServer, deps: McpDeps) => void, deps: Partial<McpDeps>, limiter = new McpRateLimiter()) {
  const audit = new AuditService(new FakeAuditRepository())
  const server = new McpServer({ name: 't', version: '1' })
  const full = { audit, locks: inProcessKeyedLock(), transactions: passThroughTransactionRunner, confirmation: { markUnconfirmed: vi.fn(), list: vi.fn(async () => []) }, ...deps } as unknown as McpDeps
  installToolGate(server, { userId: USER, assistant: ASSISTANT, limiter, audit })
  register(server, full)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  const client = new Client({ name: 'c', version: '1' })
  await client.connect(clientTransport)
  const call = async (name: string, args: Record<string, unknown>) => {
    const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] }
    return { isError: res.isError === true, body: JSON.parse(res.content[0]!.text) as Record<string, unknown> }
  }
  return { call, deps: full }
}

describe('caps under a lock (MCP-23, H2-20, H2-28)', () => {
  it('vermietung_anlegen: two calls at the last free place create one object, not two', async () => {
    const objects = Array.from({ length: MAX_RENTAL_OBJECTS_BY_ASSISTANT - 1 }, (_, i) => ({ id: `r${i}` }))
    const rentals = {
      listForUserAndYear: async () => {
        await tick()
        return [...objects]
      },
      create: async () => {
        await tick()
        const created = { id: `r${objects.length}` }
        objects.push(created)
        return created
      },
    }
    const { call } = await connect((server, deps) => registerRentalTools({ server, userId: USER, assistant: ASSISTANT }, deps), { rentals: rentals as never })
    const results = await Promise.all([call('vermietung_anlegen', { taxYear: YEAR }), call('vermietung_anlegen', { taxYear: YEAR })])
    expect(objects).toHaveLength(MAX_RENTAL_OBJECTS_BY_ASSISTANT)
    expect(results.filter((r) => r.isError).map((r) => r.body.code)).toEqual(['TOO_MANY'])
  })

  it('kind_anlegen: the same child twice at once is created once, and each call names the child it got', async () => {
    const kinder: { id: string; sequenceNumber: number; firstName: string; geburtsdatum: string }[] = []
    const children = {
      list: async () => {
        await tick()
        return { kinder: [...kinder] }
      },
      create: async (_u: string, _y: number, dto: { firstName: string; geburtsdatum: string }) => {
        await tick()
        kinder.push({ id: `k${kinder.length + 1}`, sequenceNumber: kinder.length + 1, ...dto })
        return { kinder: [...kinder] }
      },
    }
    const { call } = await connect((server, deps) => registerChildTools({ server, userId: USER, assistant: ASSISTANT }, deps), { children: children as never })
    const args = { taxYear: YEAR, firstName: 'Lio', lastName: 'X', geburtsdatum: '2020-05-01' }
    const [a, b] = await Promise.all([call('kind_anlegen', args), call('kind_anlegen', args)])
    expect(kinder).toHaveLength(1)
    expect([a.body.instance, b.body.instance]).toEqual(['k1', 'k1'])
    expect([a.body.bereitsVorhanden, b.body.bereitsVorhanden].filter(Boolean)).toHaveLength(1)
    expect(MAX_CHILDREN_BY_ASSISTANT).toBe(12)
  })

  it('kind_anlegen: a mark that fails leaves no child behind when the lock holds a transaction', async () => {
    // The in-process lock gives no rollback; the Prisma lock runs create and mark in one transaction. Here the
    // failure surfaces as a refusal with a code, never as the raw error.
    const children = { list: async () => ({ kinder: [] }), create: async () => ({ kinder: [{ id: 'k1', sequenceNumber: 1, firstName: 'A', geburtsdatum: '2020-01-01' }] }) }
    const confirmation = { markUnconfirmed: async () => Promise.reject(new Error('relation "Kennzeichnung" …')), list: async () => [] }
    const { call } = await connect((server, deps) => registerChildTools({ server, userId: USER, assistant: ASSISTANT }, deps), { children: children as never, confirmation: confirmation as never })
    const result = await call('kind_anlegen', { taxYear: YEAR, firstName: 'A', lastName: 'B', geburtsdatum: '2020-01-01' })
    expect(result).toMatchObject({ isError: true, body: { code: 'INTERNAL_ERROR' } })
    expect(JSON.stringify(result.body)).not.toContain('Kennzeichnung')
  })

  it('aufgabe_fuer_nutzer: two calls at the last free place leave one task, and an own task can be taken back', async () => {
    const repository = new FakeAssistantTaskRepository()
    const original = repository.listForUserAndYear.bind(repository)
    repository.listForUserAndYear = async (u, y) => {
      await tick()
      return original(u, y)
    }
    const tasks = new AssistantTaskService(repository)
    for (let i = 0; i < 19; i += 1) await tasks.create(USER, YEAR, { kind: 'sonstiges', text: `Bitte Punkt ${i} prüfen`, assistant: 'Claude', clientId: ASSISTANT.clientId })
    const { call } = await connect((server, deps) => registerTaskTools({ server, userId: USER, assistant: ASSISTANT }, deps), { tasks })
    const results = await Promise.all([call('aufgabe_fuer_nutzer', { taxYear: YEAR, art: 'sonstiges', text: 'Bitte A prüfen' }), call('aufgabe_fuer_nutzer', { taxYear: YEAR, art: 'sonstiges', text: 'Bitte B prüfen' })])
    expect((await tasks.listOpen(USER, YEAR)).length).toBe(20)
    expect(results.filter((r) => r.isError).map((r) => r.body.code)).toEqual(['TOO_MANY_TASKS'])

    const own = results.find((r) => !r.isError)!.body.id as string
    expect((await call('aufgabe_zuruecknehmen', { taxYear: YEAR, id: own })).body).toMatchObject({ ok: true, entfernt: own })
    expect((await call('aufgabe_zuruecknehmen', { taxYear: YEAR, id: own })).body).toMatchObject({ code: 'NO_RECORD' })
    expect((await tasks.listOpen(USER, YEAR)).length).toBe(19)
  })
})

describe('the printout-rendering tools have a budget of their own (H2-26)', () => {
  it(`ausdruck_vorpruefung, steuerbericht and pruefen share ${MCP_PRINTOUT_CHECK_LIMIT.max} a minute`, async () => {
    const check = vi.fn(async () => ({ missing: [] }))
    const report = { report: vi.fn(async () => ({ ok: true })), check: vi.fn(async () => ({ ok: true })) }
    const { call } = await connect(
      (server, deps) => {
        registerStatusTools({ server, userId: USER, assistant: ASSISTANT }, deps)
        registerReportTools({ server, userId: USER, assistant: ASSISTANT }, deps)
      },
      { printout: { check } as never, report: report as never },
    )
    const names = ['ausdruck_vorpruefung', 'steuerbericht', 'pruefen']
    for (let i = 0; i < MCP_PRINTOUT_CHECK_LIMIT.max; i += 1) expect((await call(names[i % 3]!, { taxYear: YEAR })).isError).toBe(false)
    const over = await call('pruefen', { taxYear: YEAR })
    expect(over).toMatchObject({ isError: true, body: { code: 'PRINTOUT_BUDGET' } })
  })
})

describe('smaller usability fixes', () => {
  it('eulen_hinweise says when the list is empty because the owl mode is off (MCP-18)', async () => {
    const owlMode = { getCards: async () => ({ enabled: false, cards: [], legalStatus: 'x' }) }
    const { call } = await connect((server, deps) => registerStatusTools({ server, userId: USER, assistant: ASSISTANT }, deps), { owlMode: owlMode as never })
    expect((await call('eulen_hinweise', { taxYear: YEAR })).body).toMatchObject({ eulenModusAn: false, hinweis: expect.stringContaining('Eulen-Modus ist aus') })
  })

  it('feld_finden words the hints for the external assistant, never naming propose_two_paths (H2-25)', async () => {
    const { call } = await connect((server, deps) => registerComfortTools({ server, userId: USER, assistant: ASSISTANT }, deps), {})
    const found = JSON.stringify((await call('feld_finden', { stichwort: 'Taggeld' })).body)
    expect(found).toContain('beide Wege')
    expect(found).not.toContain('propose_two_paths')
  })

  it('steuerjahre_auflisten names the account’s years and the range the app takes (MCP-10)', async () => {
    const years = { yearsOf: async () => [{ year: 2024, status: 'eingereicht', hasData: true, filedElsewhere: null }] }
    const { call } = await connect((server, deps) => registerStatusTools({ server, userId: USER, assistant: ASSISTANT }, deps), { years: years as never })
    expect((await call('steuerjahre_auflisten', {})).body).toMatchObject({ jahre: [{ steuerjahr: 2024, hatDaten: true }], moeglicheJahre: { von: 2000 } })
  })

  it('a tool result built as ok:false without the flag is flagged, with a code and a next step (MCP-19)', () => {
    const result = normalisedResult({ content: [{ type: 'text', text: JSON.stringify({ ok: false, grund: 'Keine Person B.' }, null, 2) }] })
    expect(result.isError).toBe(true)
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({ ok: false, code: 'NOT_POSSIBLE', naechsterSchritt: expect.any(String) })
  })

  it('a refusal keeps what the tool said beyond its reason, however the tool serialised it', () => {
    const result = normalisedResult({ content: [{ type: 'text', text: JSON.stringify({ ok: false, grund: 'offen', fehlt: ['lstb', 'stammdaten'] }) }] })
    expect(result.isError).toBe(true)
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({ ok: false, code: 'NOT_POSSIBLE', error: 'NOT_POSSIBLE: offen', fehlt: ['lstb', 'stammdaten'] })
  })

  it('a result that only mentions "ok": false inside a value is no refusal', () => {
    const answer = { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, notiz: 'Die Antwort war "ok": false.' }, null, 2) }] }
    expect(normalisedResult(answer)).toBe(answer)
  })

  it('an audit row inside a tool call carries the assistant even when a service writes it without one (MCP-3)', async () => {
    const repository = new FakeAuditRepository()
    const audit = new AuditService(repository)
    await runWithAuditSource(assistantAuditSource('client-x'), () => audit.append({ userId: USER, action: 'WRITE', resource: 'beleg' }))
    await audit.append({ userId: USER, action: 'READ', resource: 'profile' })
    expect(repository.all().map((row) => row.source ?? null)).toEqual(['assistent:client-x', null])
    expect((await audit.lastSeenBySource(USER, ['assistent:client-x'])).has('assistent:client-x')).toBe(true)
  })

  it('the task link filter knows every top-level domain, not a list of six (MCP-12)', () => {
    for (const text of ['Bitte auf steuer.eu nachsehen', 'siehe info.info', 'gehe zu bit.ly', 'kauf bei beste.xyz', 'http://x', 'www.irgendwas', 'ftp://a', '10.0.0.1 öffnen', 'xn--bcher-kva.example']) {
      expect(containsLink(text), text).toBe(true)
    }
    for (const text of ['Bitte die Konfession eintragen.', 'Bestätige z. B. die Anlage N.', 'Belege bis 31.05. nachreichen', 'u. a. den Lohnausweis']) {
      expect(containsLink(text), text).toBe(false)
    }
  })

  it('a client name is bounded at registration and on display (MCP-13)', () => {
    expect(isAcceptableClientName('Claude')).toBe(true)
    expect(isAcceptableClientName('x'.repeat(101))).toBe(false)
    expect(isAcceptableClientName(42)).toBe(false)
    expect(clientDisplayName('x'.repeat(500)).length).toBe(100)
    expect(clientDisplayName('   ')).toBe('Assistent')
  })
})
