import { describe, expect, it, vi } from 'vitest'
import { McpReportService } from '../src/mcp/mcp-report.service.js'
import { passThroughTransactionRunner, type TransactionRunner } from '../src/prisma/transaction.js'

const computed = (from: number, to: number) => ({
  kind: 'spanne' as const,
  result: { from, to },
  werbungskosten: 0,
  provision: { from: 0, to: 0 },
  specialExpenses: 0,
  taxableIncome: { from: 0, to: 0 },
  incomeTax: { from: 0, to: 0 },
  solidaritaetszuschlag: { from: 0, to: 0 },
  anrechnung: 0,
  churchTaxOpen: false,
})

/** A runner that, like Prisma, discards the work when it throws. */
const rollingBack: TransactionRunner = { run: (work) => work() }

function service(overrides: { estimate?: unknown; printout?: unknown; confirmation?: unknown; interview?: unknown; transactions?: TransactionRunner | undefined } = {}) {
  const estimate = overrides.estimate ?? { getState: vi.fn().mockResolvedValue(computed(100, 100)) }
  const printout = overrides.printout ?? { check: vi.fn().mockResolvedValue({ missing: [] }) }
  const confirmation = overrides.confirmation ?? { overview: vi.fn().mockResolvedValue({ annexes: [] }), writeConfirmedByAdvisor: vi.fn() }
  const interview = overrides.interview ?? { getState: vi.fn().mockResolvedValue({ answers: {}, nextStep: { kind: 'done' }, openItems: 0 }) }
  return new McpReportService(estimate as never, printout as never, confirmation as never, interview as never, 'transactions' in overrides ? overrides.transactions : rollingBack)
}

describe('McpReportService (ADR-0052 amendment 2)', () => {
  it('a printout check that fails is no "ready to print" and no go-ahead to pay', async () => {
    const report = await service({ printout: { check: vi.fn().mockRejectedValue(new Error('no forms')) } }).report('u', 2025)
    expect(report.printout.ready).toBe(false)
    expect(report.nextSteps.join(' ')).not.toContain('zahllink_anfordern')
  })

  it('names the go-ahead only when the printout is checked, everything is confirmed and the interview is done', async () => {
    const report = await service().report('u', 2025)
    expect(report.printout.ready).toBe(true)
    expect(report.nextSteps.join(' ')).toContain('zahllink_anfordern')
  })

  it('never simulates without a real transaction: the write would stay', async () => {
    const confirmation = { overview: vi.fn(), writeConfirmedByAdvisor: vi.fn() }
    const result = await service({ confirmation, transactions: passThroughTransactionRunner }).simulate('u', 2025, 'lstb', 'bruttoarbeitslohn', '50000')
    expect(result.ok).toBe(false)
    expect(confirmation.writeConfirmedByAdvisor).not.toHaveBeenCalled()
  })

  it('computes the delta between the estimate before and after the entry', async () => {
    const estimate = { getState: vi.fn().mockResolvedValueOnce(computed(100, 100)).mockResolvedValueOnce(computed(250, 250)) }
    const result = await service({ estimate }).simulate('u', 2025, 'lstb', 'bruttoarbeitslohn', '50000')
    expect(result).toEqual({ ok: true, beforeRefundEur: 100, afterRefundEur: 250, deltaEur: 150 })
  })

  it('does not hand an internal error message to the external assistant', async () => {
    const confirmation = { overview: vi.fn(), writeConfirmedByAdvisor: vi.fn().mockRejectedValue(new Error('PrismaClientKnownRequestError: relation "Lstb" at db-internal:5432')) }
    const result = await service({ confirmation }).simulate('u', 2025, 'lstb', 'bruttoarbeitslohn', '50000')
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('Prisma')
    expect(JSON.stringify(result)).not.toContain('db-internal')
  })
})
