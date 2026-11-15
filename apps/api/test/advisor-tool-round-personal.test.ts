// ADR-0091: what the tool round lets the owl prepare with and without the consent to personal data.
import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import { type AdvisorTurnRequest, type CaseDigest } from '@steuereule/core'
import { describe, expect, it } from 'vitest'
import { AdvisorGraphState, runToolRound } from '../src/ki/advisor-tool-round.js'

const digest: CaseDigest = {
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

const draft = (args: Record<string, unknown>) => ({ name: 'stage_field_draft', args: { label: 'Eintrag', reason: 'Vom Nutzer genannt', sourceId: 'estg-9-1', ...args } })

async function round(calls: { name: string; args: Record<string, unknown> }[], over: Partial<AdvisorTurnRequest> = {}) {
  let n = 0
  const state = {
    ...({} as typeof AdvisorGraphState.State),
    messages: [new AIMessage({ content: '', tool_calls: calls.map((c, i) => ({ ...c, id: `c${i}`, type: 'tool_call' as const })) })] as BaseMessage[],
    toolRounds: 0, pendingActions: [], rejectedDrafts: [], pendingTwoPaths: null, choices: [], questionRound: null, situationSuggestions: [], noteChanges: [], sources: [],
  }
  return runToolRound(state, undefined, { message: 'x', digest, ...over }, () => `act-${++n}`)
}

const personal = (update: Awaited<ReturnType<typeof round>>) => update.pendingActions.filter((a) => a.screen !== 'interview')

describe('personal data in the tool round (ADR-0091)', () => {
  it('refuses a Steuer-ID without consent and marks the refusal as one the consent would open', async () => {
    const update = await round([draft({ screen: 'profil', field: 'steuerId', newValue: '12345678901' })])
    expect(personal(update)).toHaveLength(0)
    expect(update.rejectedDrafts).toEqual([expect.objectContaining({ screen: 'profil', consentRequired: true })])
  })

  it('prepares the Steuer-ID, the IBAN and the joint return with consent', async () => {
    const update = await round(
      [
        draft({ screen: 'profil', field: 'steuerId', newValue: '12345678901' }),
        draft({ screen: 'stammdaten', field: 'iban', newValue: 'DE89370400440532013000' }),
        draft({ screen: 'kopplung', field: 'filingType', newValue: 'zusammen' }),
      ],
      { personalDataConsent: true },
    )
    expect(personal(update).map((a) => `${a.screen}.${a.field}=${a.newValue}`)).toEqual([
      'profil.steuerId=12345678901',
      'stammdaten.iban=DE89370400440532013000',
      'kopplung.filingType=zusammen',
    ])
  })

  it('prepares a new child with consent, when the draft names it and its birth date', async () => {
    const update = await round(
      [draft({ screen: 'kind', field: 'firstName', newValue: 'Felix', instance: 'neu', companionFields: { geburtsdatum: '2019-05-12', lastName: 'Richter' } })],
      { personalDataConsent: true },
    )
    expect(personal(update)).toEqual([expect.objectContaining({ screen: 'kind', field: 'firstName', instance: 'neu:1', companionFields: { geburtsdatum: '2019-05-12', lastName: 'Richter' } })])
  })

  it('does not prepare a new child without a first name and birth date to create it with', async () => {
    const update = await round([draft({ screen: 'kind', field: 'childcareEur', newValue: '1200', instance: 'neu' })], { personalDataConsent: true })
    expect(personal(update)).toHaveLength(0)
    expect(update.rejectedDrafts[0]?.reason).toMatch(/Vorname|Geburtsdatum/)
  })

  it('does not create a child without consent', async () => {
    const update = await round([draft({ screen: 'kind', field: 'childcareEur', newValue: '1200', instance: 'neu' })])
    expect(personal(update)).toHaveLength(0)
  })

  it('prepares a new rental object without consent, its area and units included', async () => {
    const update = await round([draft({ screen: 'vermietung', field: 'mieteinnahmen', newValue: '9600', instance: 'neu', companionFields: { livingArea: '85', einheiten: '1' } })])
    expect(personal(update)).toEqual([expect.objectContaining({ screen: 'vermietung', instance: 'neu:1', newValue: '9600' })])
  })

  it('drafts Person B\'s name for an existing Person B with consent', async () => {
    const update = await round([draft({ screen: 'profil', field: 'firstName', newValue: 'Nora', person: 'B' })], {
      personalDataConsent: true,
      household: { personB: { handle: 'Person B', recordable: true, figures: null } },
    })
    expect(personal(update)).toEqual([expect.objectContaining({ screen: 'profil', field: 'firstName', person: 'B', newValue: 'Nora' })])
  })
})
