// ADR-0101 §18 + ADR-0066: the owl books only as a draft. The tool round checks the draft against the
// book of the case (core checkBookingDraft) and stages it on the `buchung` mask; nothing is posted.
import { AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { type AdvisorTurnRequest, type CaseDigest } from '@steuereule/core'
import { describe, expect, it } from 'vitest'
import { AdvisorGraphState, runToolRound } from '../src/ki/advisor-tool-round.js'
import { validateStageTarget } from '../src/ki/advisor-safety.js'

const base: CaseDigest = {
  taxYear: 2025,
  filingStatus: 'einzel',
  lstbPersonA: { grossWageEur: null, wageTaxEur: null, socialSecurityEur: null },
  crossBorder: { isCrossBorderCh: false, grossWageChf: null, withholdingTaxChf: null, pillar3aChf: null, healthInsuranceChf: null, dailySicknessBenefitChf: null, nonReturnDays: null },
  commuteAndWorkdays: { workdays: 220, homeOfficeAnswer: null, homeOfficeDays: 0, distanceKm: null },
  catalogExpenses: { hasTraining: false, relocationCostsEur: null, donationsEur: null, selfPaidKvPvEur: null, riesterEur: null, doubleHouseholdRentEur: null },
  childrenCount: 0,
  rentalObjectsCount: 0,
  capitalGainEur: null,
  priorYearComparison: { donationsEur: null },
  openOwlHints: [],
  printoutMissingFields: [],
  estimatedRefundEur: null,
}
const withBook: CaseDigest = {
  ...base,
  business: { kind: 'freiberuf', mode: 'euer', chart: 'SKR03', lockedThrough: '2025-03-31', smallBusiness: false, profitSoFarEur: 12000, vatBalanceEur: 800, openBankItems: 3 },
}

const booking = (over: Record<string, unknown> = {}) => ({
  name: 'stage_booking_draft',
  args: {
    label: 'Büromaterial buchen',
    reason: 'Beleg vom Nutzer',
    date: '2025-05-02',
    documentNumber: 'Q-17',
    text: 'Büromaterial',
    lines: [
      { account: '4930', side: 'debit', amount: 11900, taxKey: 'vst19' },
      { account: '1200', side: 'credit', amount: 11900 },
    ],
    ...over,
  },
})

async function round(calls: { name: string; args: Record<string, unknown> }[], digest: CaseDigest, over: Partial<AdvisorTurnRequest> = {}) {
  let n = 0
  const state = {
    ...({} as typeof AdvisorGraphState.State),
    messages: [new AIMessage({ content: '', tool_calls: calls.map((c, i) => ({ ...c, id: `c${i}`, type: 'tool_call' as const })) })] as BaseMessage[],
    toolRounds: 0, pendingActions: [], rejectedDrafts: [], pendingTwoPaths: null, choices: [], questionRound: null, situationSuggestions: [], noteChanges: [], sources: [],
  }
  const update = await runToolRound(state, undefined, { message: 'x', digest, ...over }, () => `act-${++n}`)
  const answers = update.messages.filter((m): m is ToolMessage => m instanceof ToolMessage).map((m) => JSON.parse(m.content as string) as { ok: boolean; error?: string })
  return { update, answers }
}

describe('stage_booking_draft (ADR-0101 §18)', () => {
  it('stages a checked booking on the buchung mask, pending, never posted', async () => {
    const { update, answers } = await round([booking()], withBook)
    expect(answers[0]).toMatchObject({ ok: true })
    const draft = update.pendingActions[0]!
    expect(draft).toMatchObject({ status: 'pending', screen: 'buchung', field: 'entry', previousValue: null, sourceId: 'estg-4-3' })
    expect(draft.instance).toMatch(/^entwurf-/)
    expect(JSON.parse(draft.newValue)).toMatchObject({ documentNumber: 'Q-17', lines: [{ account: '4930' }, { account: '1200' }] })
  })

  it.each([
    ['an account the chart does not have', { lines: [{ account: '9999', side: 'debit', amount: 100 }, { account: '1200', side: 'credit', amount: 100 }] }, 'UNKNOWN_ACCOUNT'],
    ['unbalanced amounts', { lines: [{ account: '4930', side: 'debit', amount: 100 }, { account: '1200', side: 'credit', amount: 90 }] }, 'UNBALANCED'],
    ['a locked period', { date: '2025-02-01' }, 'PERIOD_LOCKED'],
    ['another year', { date: '2024-12-30' }, 'WRONG_YEAR'],
    ['an unknown tax key', { lines: [{ account: '4930', side: 'debit', amount: 100, taxKey: 'vst16' }, { account: '1200', side: 'credit', amount: 100 }] }, 'INVALID_BOOKING'],
  ])('refuses %s', async (_label, over, code) => {
    const { update, answers } = await round([booking(over)], withBook)
    expect(update.pendingActions).toHaveLength(0)
    expect(answers[0]?.error).toContain(code)
  })

  it('refuses without a book in the case (switch off, no business)', async () => {
    const { answers } = await round([booking()], base)
    expect(answers[0]?.error).toContain('NO_BOOK')
  })

  it('stage_field_draft cannot reach the buchung mask', () => {
    expect(validateStageTarget('buchung', 'entry')).toMatchObject({ ok: false, error: expect.stringContaining('stage_booking_draft') })
  })
})
