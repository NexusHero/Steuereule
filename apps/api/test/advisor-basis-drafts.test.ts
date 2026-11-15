import { describe, expect, it } from 'vitest'
import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import { MAX_DRAFTS_PER_TURN } from '../src/ki/advisor-tools.js'
import { AdvisorGraphState, runToolRound } from '../src/ki/advisor-tool-round.js'
import { buildStableSystemPrompt } from '../src/ki/advisor-prompt.js'
import { type CaseDigest } from '@steuereule/core'

const digest = (over: Partial<CaseDigest> = {}): CaseDigest => ({
  taxYear: 2025,
  filingStatus: 'einzel',
  lstbPersonA: { grossWageEur: 60000, wageTaxEur: 9000, socialSecurityEur: 12000 },
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
  answeredBasis: [],
  ...over,
})

async function round(d: CaseDigest, pendingActions: never[] = [], calls: { name: string; args: Record<string, unknown> }[] = []) {
  let n = 0
  const state = {
    ...({} as typeof AdvisorGraphState.State),
    messages: [new AIMessage({ content: '', tool_calls: calls.map((c, i) => ({ ...c, id: `c${i}`, type: 'tool_call' as const })) })] as BaseMessage[],
    toolRounds: 0, pendingActions, rejectedDrafts: [], pendingTwoPaths: null, choices: [], questionRound: null, situationSuggestions: [], noteChanges: [], sources: [],
  }
  return runToolRound(state, undefined, { message: 'x', digest: d }, () => `act-${++n}`)
}

describe('derived basis drafts', () => {
  it('adds job Angestellt from the wage tax certificate as an ordinary pending draft', async () => {
    const update = await round(digest())
    expect(update.pendingActions).toHaveLength(1)
    expect(update.pendingActions[0]).toMatchObject({ screen: 'interview', field: 'job', newValue: 'Angestellt', status: 'pending', sourceId: 'estg-9-1' })
  })
  it('adds job and Switzerland for a Lohnausweis', async () => {
    const update = await round(digest({ lstbPersonA: { grossWageEur: null, wageTaxEur: null, socialSecurityEur: null }, crossBorder: { ...digest().crossBorder, grossWageChf: 90000 } }))
    expect(update.pendingActions.map((a) => `${a.field}=${a.newValue}`)).toEqual(['job=Angestellt', 'ausland=Ja, in die Schweiz'])
  })
  it('does not duplicate what the model staged itself, nor override an answer', async () => {
    const own = await round(digest(), [], [{ name: 'stage_field_draft', args: { screen: 'interview', field: 'job', newValue: 'Angestellt', label: 'Beruf', reason: 'weil', sourceId: 'estg-9-1' } }])
    expect(own.pendingActions.filter((a) => a.field === 'job')).toHaveLength(1)
    expect((await round(digest({ answeredBasis: ['job'] }))).pendingActions).toHaveLength(0)
  })
  it('respects the draft limit', async () => {
    const full = Array.from({ length: MAX_DRAFTS_PER_TURN }, (_, i) => ({ actionId: `x${i}`, screen: 'kind', field: `f${i}` })) as never[]
    expect((await round(digest(), full)).pendingActions).toHaveLength(MAX_DRAFTS_PER_TURN)
  })
})

describe('basis questions in the prompt', () => {
  it('requires the basis answers, kirchensteuer 0 and the holiday region', () => {
    const prompt = buildStableSystemPrompt()
    expect(prompt).toContain('interview.job')
    expect(prompt).toContain('kapital.kirchensteuer')
    expect(prompt).toContain('commute.publicHolidayRegion')
  })
})
