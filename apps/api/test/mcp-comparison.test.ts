// #548: joint against separate assessment from the recorded figures of both persons, and this year beside
// the year before, in the app's own figures (McpReportService), never a typed partner income.
import { describe, expect, it, vi } from 'vitest'
import { filingTypeComparison } from '@steuereule/core'
import { passThroughTransactionRunner } from '../src/common/transaction-runner.js'
import { McpReportService } from '../src/mcp/mcp-report.service.js'
import { registerComparisonTools } from '../src/mcp/tools/comparison-tools.js'
import { connectMcpTools } from './support/mcp-client.js'

const range = (n: number) => ({ from: n, to: n })

const estimateFor = (over: Record<string, unknown> = {}) => ({
  kind: 'spanne' as const,
  result: range(1200),
  werbungskosten: 0,
  provision: range(9000),
  specialExpenses: 36,
  taxableIncome: range(120000),
  incomeTax: range(30000),
  solidaritaetszuschlag: range(0),
  anrechnung: 31000,
  churchTaxOpen: false,
  jointAssessment: true,
  breakdown: {
    persons: [{ incomeEur: 90000, workExpensesEur: 1230, creditedTaxEur: 20000 }, { incomeEur: 30000, workExpensesEur: 1230, creditedTaxEur: 11000 }],
    totalIncomeEur: 120000,
    extraordinaryBurdenEur: 0,
    tariffTax: range(30000),
    householdReductionEur: 0,
  },
  ...over,
})

function service(options: { estimate?: (userId: string, year: number) => unknown; answers?: Record<string, string>; values?: (year: number, keys: readonly string[]) => Record<string, string | null> } = {}) {
  const estimate = { getState: vi.fn(async (u: string, y: number) => (options.estimate ?? (() => estimateFor()))(u, y)) }
  const interview = { getState: vi.fn().mockResolvedValue({ answers: options.answers ?? { lohnersatz: 'Nein' }, nextStep: { kind: 'done' }, openItems: 0 }) }
  const confirmation = { readRawValues: vi.fn(async (_u: string, y: number, keys: readonly string[]) => (options.values ?? (() => ({})))(y, keys)) }
  return new McpReportService(estimate as never, {} as never, confirmation as never, interview as never, {} as never, passThroughTransactionRunner)
}

describe('veranlagung_vergleichen: joint against separate from the case data', () => {
  it('splits the zvE of the estimate by the persons’ income and runs the core comparison', async () => {
    const result = await service().compareFilingTypes('u', 2025)
    const core = filingTypeComparison({ zveA: 90000, zveB: 30000, year: 2025, progressionClause: { kind: 'keine' } })
    expect(result).toMatchObject({
      ok: true,
      taxYear: 2025,
      zuVersteuerndesEinkommen: { personA: 90000, personB: 30000 },
      einzelveranlagungEur: core.single,
      zusammenveranlagungEur: core.joint,
      differenzEur: core.delta,
      aussage: 'eindeutig',
      empfehlung: 'zusammen',
    })
    expect(String(result.lesehilfe)).toContain('Näherung')
  })

  it('says why it cannot compare: no Person B, no estimate, an unknown progression clause', async () => {
    const single = await service({ estimate: () => estimateFor({ jointAssessment: false, breakdown: { ...estimateFor().breakdown, persons: [{ incomeEur: 50000, workExpensesEur: 1230, creditedTaxEur: 9000 }] } }) }).compareFilingTypes('u', 2025)
    expect(single).toMatchObject({ ok: false })
    expect(String(single.grund)).toContain('Person B')

    const open = await service({ estimate: () => ({ kind: 'offen', missing: ['lstb'] }) }).compareFilingTypes('u', 2025)
    expect(open).toMatchObject({ ok: false, fehlt: ['lstb'] })

    const unknown = await service({ answers: {} }).compareFilingTypes('u', 2025)
    expect(unknown).toMatchObject({ ok: true, aussage: 'unbestimmt' })
  })
})

describe('vorjahr_vergleichen: this year beside the year before', () => {
  it('lays both breakdowns side by side and names the fields that had a value last year and are empty now', async () => {
    const values = (year: number, keys: readonly string[]) =>
      Object.fromEntries(keys.map((key) => [key, year === 2024 && (key === 'lstb.bruttoarbeitslohn' || key === 'commute.oneWayKm' || key === 'kapital.kapitalertraege') ? '123' : year === 2025 && key === 'lstb.bruttoarbeitslohn' ? '456' : null]))
    const result = await service({ estimate: (_u, y) => estimateFor({ result: range(y === 2024 ? 800 : 1200) }), values }).compareYears('u', 2025)
    expect(result).toMatchObject({ ok: true, taxYear: 2025, vorjahr: 2024 })
    expect((result.diesesJahr as Record<string, unknown>).ergebnisEur).toBe(1200)
    expect((result.vorjahrZahlen as Record<string, unknown>).ergebnisEur).toBe(800)
    expect(result.veraenderung).toMatchObject({ ergebnisEur: 400 })
    expect(result.imVorjahrGefuelltJetztLeer).toEqual([
      { screen: 'commute', felder: ['oneWayKm'] },
      { screen: 'kapital', felder: ['kapitalertraege'] },
    ])
    // Names only: no value of last year leaves the service beside the breakdown.
    expect(JSON.stringify(result.imVorjahrGefuelltJetztLeer)).not.toContain('123')
  })

  it('says so when the year before holds nothing in this account', async () => {
    const result = await service({ estimate: (_u, y) => (y === 2024 ? { kind: 'offen', missing: ['lstb'] } : estimateFor()) }).compareYears('u', 2025)
    expect(result).toMatchObject({ ok: false })
    expect(String(result.grund)).toContain('2024')
  })
})

describe('the comparison tools over MCP', () => {
  const connect = async (scopes: string[], deps: Record<string, unknown>) =>
    (await connectMcpTools(registerComparisonTools, { userId: 'u', assistant: { clientId: 'c', clientName: 'Claude', scopes }, deps: deps as never })).client
  const text = (res: unknown) => (res as { content: { text: string }[] }).content[0]!.text

  it('veranlagung_vergleichen and vorjahr_vergleichen read with the read scope, audit, and count records of both years', async () => {
    const audited: string[] = []
    const report = { compareFilingTypes: vi.fn().mockResolvedValue({ ok: true, differenzEur: -900 }), compareYears: vi.fn().mockResolvedValue({ ok: true, vorjahr: 2024 }) }
    const rentals = { listForUserAndYear: vi.fn(async (_u: string, y: number) => (y === 2024 ? [{ id: 'r1' }, { id: 'r2' }] : [{ id: 'r3' }])) }
    const children = { list: vi.fn(async () => ({ kinder: [{ id: 'k1', firstName: 'Lio' }] })) }
    const client = await connect(['steuerdaten:read'], { report, rentals, children, audit: { append: async (e: { resource: string }) => void audited.push(e.resource) } })

    expect(JSON.parse(text(await client.callTool({ name: 'veranlagung_vergleichen', arguments: { taxYear: 2025 } })))).toEqual({ ok: true, differenzEur: -900 })
    const years = JSON.parse(text(await client.callTool({ name: 'vorjahr_vergleichen', arguments: { taxYear: 2025 } })))
    expect(years).toMatchObject({ ok: true, vorjahr: 2024, datensaetze: { vermietungsobjekte: { vorjahr: 2, diesesJahr: 1 }, kinder: { vorjahr: 1, diesesJahr: 1 } } })
    expect(JSON.stringify(years)).not.toContain('Lio')
    expect(audited).toEqual(['veranlagung_vergleichen', 'vorjahr_vergleichen'])

    const blind = await connect([], { report, audit: { append: async () => {} } })
    expect(text(await blind.callTool({ name: 'vorjahr_vergleichen', arguments: { taxYear: 2025 } }))).toContain('steuerdaten:read')
  })
})
