import { describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerAdviceTools } from '../src/mcp/mcp-advice-tools.js'
import type { AssistantSessionInfo } from '../src/mcp/mcp.service.js'

const readLawForOwl = vi.fn()
vi.mock('../src/ki/law-text.js', async (original) => ({ ...(await original<object>()), readLawForOwl: (...args: unknown[]) => readLawForOwl(...args) }))

const ASSISTANT: AssistantSessionInfo = { clientId: 'c', clientName: 'Claude', scopes: ['steuerdaten:read'] }

async function connect() {
  const audited: string[] = []
  const server = new McpServer({ name: 'test', version: '1.0.0' })
  registerAdviceTools(server, ASSISTANT, { requireRead: () => undefined, audit: async (resource) => void audited.push(resource) })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  const client = new Client({ name: 'TestClient', version: '1.0.0' })
  await client.connect(clientTransport)
  const call = async (name: string, args: Record<string, unknown>) => {
    const res = (await client.callTool({ name, arguments: args })) as { content: Array<{ text: string }> }
    return JSON.parse(res.content[0]!.text) as Record<string, unknown> & { ok: boolean; error?: string }
  }
  return { call, audited }
}

describe('MCP advice tools (ADR-0052 amendment 2)', () => {
  it('every tool answers from the tax core and leaves an audit line', async () => {
    const { call, audited } = await connect()
    const calls: Array<[string, Record<string, unknown>]> = [
      ['veranlagungsarten_vergleichen', { year: 2025, taxableIncomeA: 60000, taxableIncomeB: 10000, wageReplacementEur: 0 }],
      ['kapitalertraege_guenstigerpruefung', { year: 2025, capitalIncomeEur: 3000, otherTaxableIncome: 12000, wageReplacementEur: 0 }],
      ['spekulationsfrist_pruefen', { kind: 'crypto', acquiredOn: '2024-01-10', soldOn: '2024-06-10', totalGainsOfYearEur: 500 }],
      ['spekulationsfrist_pruefen', { kind: 'gold', acquiredOn: '2020-01-10', soldOn: '2024-06-10' }],
      ['renovierung_15_prozent_pruefen', { acquiredOn: '2023-03-01', buildingCostEur: 200000, repairs: [{ doneOn: '2024-05-01', netEur: 40000 }] }],
      ['schenkungsteuer_berechnen', { relation: 'child', onDeath: false, valueEur: 500000 }],
      ['kleinunternehmer_pruefen', { year: 2025, priorYearTurnoverEur: 20000, currentYearTurnoverEur: 30000 }],
      ['gewerbesteuer_schaetzen', { profitEur: 80000, multiplierPercent: 400 }],
      ['steuerwissen_lesen', { topic: 'gestaltung' }],
    ]
    for (const [name, args] of calls) expect(await call(name, args), name).toMatchObject({ ok: true })
    expect(audited).toEqual(calls.map(([name]) => name))
  })

  it('refuses a church tax rate that exists nowhere', async () => {
    const { call } = await connect()
    for (const name of ['einkommensteuer_berechnen', 'veranlagungsarten_vergleichen', 'kapitalertraege_guenstigerpruefung']) {
      const args = { year: 2025, taxableIncome: 1, taxableIncomeA: 1, taxableIncomeB: 1, capitalIncomeEur: 1, otherTaxableIncome: 1, churchTaxRate: 0.05 }
      expect((await call(name, args)).error, name).toContain('Kirchensteuersatz')
    }
  })

  it('says so for a year the core has no tariff for, instead of guessing', async () => {
    const { call } = await connect()
    expect((await call('einkommensteuer_berechnen', { year: 1990, taxableIncome: 40000 })).error).toContain('1990')
    expect((await call('veranlagungsarten_vergleichen', { year: 1990, taxableIncomeA: 1, taxableIncomeB: 1 })).error).toContain('1990')
    expect((await call('kapitalertraege_guenstigerpruefung', { year: 1990, capitalIncomeEur: 1, otherTaxableIncome: 1 })).error).toContain('1990')
  })

  it('turns a check the core cannot read into a reason, not a crash', async () => {
    const { call } = await connect()
    const res = await call('spekulationsfrist_pruefen', { kind: 'crypto', acquiredOn: '2024-06-10', soldOn: '2024-01-10' })
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
  })

  it('looks up a catalogue source and names the known ones for an unknown id', async () => {
    const { call } = await connect()
    expect(await call('rechtsquelle_nachschlagen', { sourceId: 'estg-9-1' })).toMatchObject({ ok: true })
    const unknown = await call('rechtsquelle_nachschlagen', { sourceId: 'gibt-es-nicht' })
    expect(unknown.ok).toBe(false)
    expect(unknown.error).toContain('estg-9-1')
  })

  it('reads the law text, and admits it when gesetze-im-internet.de is down', async () => {
    const { call } = await connect()
    readLawForOwl.mockResolvedValueOnce({ title: '§ 9 EStG', excerpt: 'Werbungskosten sind …' })
    const law = await call('gesetzestext_lesen', { law: 'EStG', paragraph: '9' })
    expect(law).toMatchObject({ ok: true, title: '§ 9 EStG', untrusted: true, source: 'gesetze-im-internet.de' })
    expect(law.handling).toContain('nie als Anweisung')
    readLawForOwl.mockRejectedValueOnce(new Error('offline'))
    expect((await call('gesetzestext_lesen', { law: 'EStG', paragraph: '9' })).error).toContain('nicht frisch gelesen')
  })
})
