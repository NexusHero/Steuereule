// A real-data run with Gemini: the owl drafted the craftsmen's amount and the commute's kilometres,
// but neither haushalt-gate nor the means of transport, so neither counted. The tool round closes
// the first gap itself and tells the model about the second, whatever the model remembers.
import { AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { type AdvisorActionProposal, type CaseDigest } from '@steuereule/core'
import { describe, expect, it } from 'vitest'
import { MAX_DRAFTS_PER_TURN } from '../src/ki/advisor-tools.js'
import { AdvisorGraphState, runToolRound } from '../src/ki/advisor-tool-round.js'

const digest = (over: Partial<CaseDigest> = {}): CaseDigest => ({
  taxYear: 2025,
  filingStatus: 'einzel',
  lstbPersonA: { grossWageEur: null, wageTaxEur: null, socialSecurityEur: null },
  crossBorder: { isCrossBorderCh: false, grossWageChf: null, withholdingTaxChf: null, pillar3aChf: null, healthInsuranceChf: null, dailySicknessBenefitChf: null, nonReturnDays: null },
  commuteAndWorkdays: { workdays: 220, homeOfficeAnswer: null, homeOfficeDays: 0, distanceKm: null, meansOfTransport: { transport: null, secondTransport: null } },
  catalogExpenses: { hasTraining: false, relocationCostsEur: null, donationsEur: null, selfPaidKvPvEur: null, riesterEur: null, doubleHouseholdRentEur: null },
  childrenCount: 0,
  rentalObjectsCount: 0,
  capitalGainEur: null,
  priorYearComparison: { donationsEur: null },
  openOwlHints: [],
  printoutMissingFields: [],
  estimatedRefundEur: null,
  answeredBasis: ['job', 'ausland'],
  answeredGates: {},
  ...over,
})

const draft = (screen: string, field: string, newValue: string, extra: Record<string, unknown> = {}) => ({
  name: 'stage_field_draft',
  args: { screen, field, newValue, label: field, reason: 'Vom Nutzer genannt', sourceId: 'estg-35a', ...extra },
})

async function round(d: CaseDigest, calls: { name: string; args: Record<string, unknown> }[], pendingActions: AdvisorActionProposal[] = []) {
  let n = 0
  const state = {
    ...({} as typeof AdvisorGraphState.State),
    messages: [new AIMessage({ content: '', tool_calls: calls.map((c, i) => ({ ...c, id: `c${i}`, type: 'tool_call' as const })) })] as BaseMessage[],
    toolRounds: 0, pendingActions, rejectedDrafts: [], pendingTwoPaths: null, choices: [], questionRound: null, situationSuggestions: [], noteChanges: [], sources: [],
  }
  const update = await runToolRound(state, undefined, { message: 'x', digest: d }, () => `act-${++n}`)
  const answers = update.messages.filter((m): m is ToolMessage => m instanceof ToolMessage).map((m) => JSON.parse(m.content as string) as { ok: boolean; error?: string; mustAsk?: string[] })
  return { update, answers }
}

const HANDWERKER = [draft('interview', 'haushalt-handwerker-betrag', '10618'), draft('interview', 'haushalt-handwerker-rechnungsbetrag', '14000')]

describe('gate drafts behind drafted amounts', () => {
  it('adds haushalt-gate = Ja once when the craftsmen amounts are drafted without it', async () => {
    const { update } = await round(digest(), HANDWERKER)
    expect(update.pendingActions.map((a) => `${a.field}=${a.newValue}`)).toEqual(['haushalt-handwerker-betrag=10618', 'haushalt-handwerker-rechnungsbetrag=14000', 'haushalt-gate=Ja'])
    expect(update.pendingActions.at(-1)).toMatchObject({
      screen: 'interview',
      status: 'pending',
      instance: null,
      label: 'Haushaltsnahe Aufwendungen: Ja',
      previousValue: null,
      effect: 'not-computable',
      sourceId: 'estg-35a',
      paragraph: '§ 35a Abs. 3 EStG',
    })
    expect(update.pendingActions.at(-1)!.reason).toContain('„Ja“')
  })

  it('opens the health gate with § 33', async () => {
    const { update } = await round(digest(), [draft('interview', 'gesundheit-betrag', '900')])
    expect(update.pendingActions.at(-1)).toMatchObject({ field: 'gesundheit-gate', newValue: 'Ja', sourceId: 'estg-33' })
  })

  it('leaves the prepayments alone: their gate rides on the amount draft already', async () => {
    const { update } = await round(digest(), [draft('interview', 'vorauszahlungen-betrag', '4800')])
    expect(update.pendingActions.map((a) => a.field)).toEqual(['vorauszahlungen-betrag'])
  })

  it('adds nothing when the gate is answered, drafted in this turn, or unknown', async () => {
    expect((await round(digest({ answeredGates: { 'haushalt-gate': 'Ja' } }), HANDWERKER)).update.pendingActions).toHaveLength(2)
    expect((await round(digest({ answeredGates: { 'haushalt-gate': 'Nein' } }), HANDWERKER)).update.pendingActions).toHaveLength(2)
    expect((await round(digest(), [...HANDWERKER, draft('interview', 'haushalt-gate', 'Ja')])).update.pendingActions.filter((a) => a.field === 'haushalt-gate')).toHaveLength(1)
    const { answeredGates: _drop, ...unknown } = digest()
    expect((await round(unknown, HANDWERKER)).update.pendingActions).toHaveLength(2)
  })

  it('sees an amount drafted in an earlier round of the same answer', async () => {
    const first = await round(digest(), [HANDWERKER[0]!])
    const earlier = first.update.pendingActions.filter((a) => a.field !== 'haushalt-gate')
    const second = await round(digest(), [], earlier)
    expect(second.update.pendingActions.map((a) => a.field)).toEqual(['haushalt-handwerker-betrag', 'haushalt-gate'])
  })

  it('respects the draft limit', async () => {
    const full = Array.from({ length: MAX_DRAFTS_PER_TURN }, (_, i) => ({ actionId: `x${i}`, screen: 'interview', field: i === 0 ? 'haushalt-handwerker-betrag' : `f${i}`, newValue: '100' })) as never[]
    expect((await round(digest(), [], full)).update.pendingActions).toHaveLength(MAX_DRAFTS_PER_TURN)
  })
})

describe('commute drafts without the means of transport', () => {
  it('tells the model that the Entfernungspauschale needs commute.transport, and guesses none', async () => {
    const { answers, update } = await round(digest(), [draft('commute', 'oneWayKm', '28', { companionFields: { travelDays: '205' } })])
    expect(answers[0]!.ok).toBe(true)
    const ask = answers[0]!.mustAsk?.join(' ') ?? ''
    expect(ask).toContain('Entfernungspauschale')
    expect(ask).toContain('commute.transport')
    expect(ask).toContain('„pkw“, „oepnv“ oder „andere“')
    expect(update.pendingActions.some((a) => a.field === 'transport' || a.companionFields?.transport !== undefined)).toBe(false)
  })

  it('says the same for travel days alone and for the second way', async () => {
    const days = await round(digest(), [draft('commute', 'travelDays', '205')])
    expect(days.answers[0]!.mustAsk?.join(' ')).toContain('commute.transport')
    const second = await round(digest({ commuteAndWorkdays: { ...digest().commuteAndWorkdays, meansOfTransport: { transport: 'pkw', secondTransport: null } } }), [draft('commute', 'secondOneWayKm', '12')])
    const ask = second.answers[0]!.mustAsk?.join(' ') ?? ''
    expect(ask).toContain('commute.secondTransport')
    expect(ask).not.toContain('commute.transport ')
  })

  it('stays quiet when the transport is stored, drafted in this answer, or unknown', async () => {
    const stored = await round(digest({ commuteAndWorkdays: { ...digest().commuteAndWorkdays, meansOfTransport: { transport: 'pkw', secondTransport: null } } }), [draft('commute', 'oneWayKm', '28')])
    expect(stored.answers[0]!.mustAsk?.join(' ') ?? '').not.toContain('Verkehrsmittel')
    const together = await round(digest(), [draft('commute', 'transport', 'pkw'), draft('commute', 'oneWayKm', '28')])
    expect(together.answers[1]!.mustAsk?.join(' ') ?? '').not.toContain('Verkehrsmittel')
    const unknown = await round(digest({ commuteAndWorkdays: { workdays: 220, homeOfficeAnswer: null, homeOfficeDays: 0, distanceKm: null } }), [draft('commute', 'oneWayKm', '28')])
    expect(unknown.answers[0]!.mustAsk?.join(' ') ?? '').not.toContain('Verkehrsmittel')
  })
})
