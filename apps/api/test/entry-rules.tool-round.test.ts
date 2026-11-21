// ADR-0093: the fixed rules as the tool round enforces them, whatever the model understood.
import { AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { type AdvisorTurnRequest, type CaseDigest } from '@steuereule/core'
import { describe, expect, it } from 'vitest'
import { AdvisorGraphState, runToolRound } from '../src/ki/advisor-tool-round.js'

const digest: CaseDigest = {
  taxYear: 2025,
  filingStatus: 'einzel',
  lstbPersonA: { grossWageEur: null, wageTaxEur: null, socialSecurityEur: null },
  crossBorder: { isCrossBorderCh: true, grossWageChf: null, withholdingTaxChf: null, pillar3aChf: null, healthInsuranceChf: null, dailySicknessBenefitChf: null, nonReturnDays: null },
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

const draft = (args: Record<string, unknown>) => ({ name: 'stage_field_draft', args: { label: 'Eintrag', reason: 'Vom Nutzer genannt', sourceId: 'estg-9-1', ...args } })
const path = (field: string, newValue: string) => ({ screen: 'chLohnausweis', field, newValue, label: `Weg ${newValue}`, reason: 'x' })

async function round(calls: { name: string; args: Record<string, unknown> }[], over: Partial<AdvisorTurnRequest> = {}) {
  let n = 0
  const state = {
    ...({} as typeof AdvisorGraphState.State),
    messages: [new AIMessage({ content: '', tool_calls: calls.map((c, i) => ({ ...c, id: `c${i}`, type: 'tool_call' as const })) })] as BaseMessage[],
    toolRounds: 0, pendingActions: [], rejectedDrafts: [], pendingTwoPaths: null, choices: [], questionRound: null, situationSuggestions: [], noteChanges: [], sources: [],
  }
  const update = await runToolRound(state, undefined, { message: 'x', digest, ...over }, () => `act-${++n}`)
  const answers = update.messages.filter((m): m is ToolMessage => m instanceof ToolMessage).map((m) => JSON.parse(m.content as string) as { ok: boolean; error?: string; mustAsk?: string[] })
  const drafts = update.pendingActions.filter((a) => !(a.screen === 'interview' && ['job', 'ausland'].includes(a.field)))
  return { update, answers, drafts }
}

describe('fixed rules in the tool round (ADR-0093)', () => {
  it('makes no draft for a family allowance on the wage until Ziffer 8 is confirmed to contain it', async () => {
    const { answers, drafts, update } = await round([draft({ screen: 'chLohnausweis', field: 'familienzulagenChf', newValue: '2400' })])
    expect(drafts).toHaveLength(0)
    expect(answers[0]).toMatchObject({ ok: false })
    expect(answers[0]!.error).toContain('CONFIRMATION_REQUIRED')
    expect(answers[0]!.error).toContain('Ziffer 8')
    // A question for the user, not a failure the answer has to admit.
    expect(update.rejectedDrafts).toHaveLength(0)
  })

  it('takes the allowance with the confirmation as a companion field', async () => {
    const { drafts } = await round([draft({ screen: 'chLohnausweis', field: 'familienzulagenChf', newValue: '2400', companionFields: { familienzulagenImBruttolohn: 'ja' } })])
    expect(drafts).toEqual([expect.objectContaining({ field: 'familienzulagenChf', newValue: '2400', companionFields: { familienzulagenImBruttolohn: 'true' } })])
  })

  it('takes paid-out Krankentaggeld only as two paths, with both treatments', async () => {
    const single = await round([draft({ screen: 'chLohnausweis', field: 'steuerfreiesKrankentaggeldChf', newValue: '2900' })])
    expect(single.drafts).toHaveLength(0)
    expect(single.answers[0]!.error).toContain('TWO_PATHS_REQUIRED')

    const both = await round([
      { name: 'propose_two_paths', args: { title: 'Krankentaggeld in Ziffer 8?', sourceId: 'estg-9-1', safePath: path('steuerfreiesKrankentaggeldChf', '0'), maxPath: path('steuerfreiesKrankentaggeldChf', '2900') } },
    ])
    expect(both.answers[0]).toMatchObject({ ok: true })
    expect(both.update.pendingTwoPaths).toMatchObject({ safePath: { newValue: '0' }, maxPath: { newValue: '2900' } })
  })

  it('stages prepayments from the amount alone and sets the gate itself', async () => {
    const { drafts } = await round([draft({ screen: 'interview', field: 'vorauszahlungen-betrag', newValue: '4.800 Euro' })])
    expect(drafts).toEqual([expect.objectContaining({ field: 'vorauszahlungen-betrag', newValue: '4800', companionFields: { 'vorauszahlungen-gate': 'Ja' } })])
  })

  it('tells the model to ask for Zeile 24 and for the shortest route', async () => {
    const { answers, drafts } = await round([
      draft({ screen: 'lstb', field: 'kvArbeitnehmer', newValue: '3100', companionFields: { rvArbeitnehmer: '6150', pvArbeitnehmer: '640', avArbeitnehmer: '520' } }),
      draft({ screen: 'commute', field: 'oneWayKm', newValue: '30', companionFields: { travelDays: '205', transport: 'pkw' } }),
    ])
    expect(drafts).toHaveLength(2)
    expect(answers[0]!.mustAsk?.join(' ')).toContain('Zeile 24')
    expect(answers[1]!.mustAsk?.join(' ')).toContain('kürzeste Straßenverbindung')
  })

  it('takes a negative Ziffer 7', async () => {
    const { drafts } = await round([draft({ screen: 'chLohnausweis', field: 'andere-leistungen', newValue: '-75' })])
    expect(drafts).toEqual([expect.objectContaining({ field: 'andere-leistungen', newValue: '-75' })])
  })

  it('does not answer „Weitere Einkünfte“ with „Nein“ when the user named a deposit account with exemption orders', async () => {
    const message = 'Kapitalerträge: gemeinsames Depot bei einer deutschen Bank, Freistellungsaufträge zusammen 1.600 Euro; Vermietung haben wir nicht.'
    const refused = await round([draft({ screen: 'interview', field: 'einkuenfte', newValue: 'Nein', reason: 'Im Rahmen des Freistellungsauftrags' })], { message })
    expect(refused.drafts).toHaveLength(0)
    expect(refused.answers[0]!.error).toContain('CONFIRMATION_REQUIRED')
    expect(refused.answers[0]!.error).toContain('kapital.kapitalertraege')

    const recorded = await round([draft({ screen: 'interview', field: 'einkuenfte', newValue: 'Kapitalerträge' })], { message })
    expect(recorded.drafts).toEqual([expect.objectContaining({ field: 'einkuenfte', newValue: 'Kapitalerträge' })])
    const none = await round([draft({ screen: 'interview', field: 'einkuenfte', newValue: 'Nein', reason: 'Nutzer verneint' })], { message: 'Kapitalerträge hatten wir nicht, Vermietung auch nicht.' })
    expect(none.drafts).toEqual([expect.objectContaining({ field: 'einkuenfte', newValue: 'Nein' })])
  })

  it('tells the model to ask for the paid-out sickness benefit, the craftsman conditions and the donation year', async () => {
    const { answers } = await round([
      draft({ screen: 'chLohnausweis', field: 'bruttolohn-total', newValue: '98000' }),
      draft({ screen: 'interview', field: 'haushalt-handwerker-betrag', newValue: '1400' }),
      draft({ screen: 'interview', field: 'spenden-betrag', newValue: '300' }),
    ])
    expect(answers.map((a) => a.ok)).toEqual([true, true, true])
    expect(answers[0]!.mustAsk?.join(' ')).toContain('Krankentaggeld')
    expect(answers[1]!.mustAsk?.join(' ')).toContain('Überweisung')
    expect(answers[2]!.mustAsk?.join(' ')).toContain('gezahlt')
  })
})
