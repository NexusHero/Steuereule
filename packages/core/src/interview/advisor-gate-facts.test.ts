import { describe, expect, it } from 'vitest'
import type { CaseDigest } from './advisor'
import { ADVISOR_LEGAL_SOURCES } from './advisor'
import { GATE_COPY, deriveGateAnswers } from './advisor-gate-facts'
import { QUESTIONS, YES_NO_GATE_IDS, yesNoGateOf } from './interview'

const BASE: CaseDigest = {
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
  answeredGates: {},
}

describe('yes/no gates from the catalogue', () => {
  it('maps a follow-up to the yes/no question that opens it', () => {
    expect(yesNoGateOf('haushalt-handwerker-betrag')).toEqual({ gate: 'haushalt-gate', opensWith: 'Ja' })
    expect(yesNoGateOf('haushalt-handwerker-rechnungsbetrag')).toEqual({ gate: 'haushalt-gate', opensWith: 'Ja' })
    expect(yesNoGateOf('haushalt-dienstleistung-betrag')?.gate).toBe('haushalt-gate')
    expect(yesNoGateOf('haushalt-minijob-betrag')?.gate).toBe('haushalt-gate')
    expect(yesNoGateOf('gesundheit-betrag')).toEqual({ gate: 'gesundheit-gate', opensWith: 'Ja' })
    expect(yesNoGateOf('gesundheit-erstattung')?.gate).toBe('gesundheit-gate')
    expect(yesNoGateOf('vorauszahlungen-betrag')).toEqual({ gate: 'vorauszahlungen-gate', opensWith: 'Ja' })
  })

  it('knows nothing behind questions that are not yes/no, nor for the gates themselves', () => {
    expect(yesNoGateOf('haushalt-gate')).toBeUndefined()
    expect(yesNoGateOf('job')).toBeUndefined()
    // Behind „Art der Krankenversicherung“, which is not a yes/no question.
    expect(yesNoGateOf('kv-krankengeld')).toBeUndefined()
    expect(yesNoGateOf('gibt-es-nicht')).toBeUndefined()
  })

  it('lists exactly the yes/no questions with a „Ja“ branch', () => {
    expect(YES_NO_GATE_IDS).toEqual(expect.arrayContaining(['haushalt-gate', 'gesundheit-gate', 'vorauszahlungen-gate']))
    for (const id of YES_NO_GATE_IDS) {
      const decl = QUESTIONS[id]
      expect(decl.form).toEqual({ kind: 'enum', values: ['Ja', 'Nein'] })
      expect(decl.followUps?.Ja?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it('has German copy and a known source for every gate, so a new gate cannot go out without it', () => {
    for (const id of YES_NO_GATE_IDS) {
      const copy = GATE_COPY[id]
      expect(copy, id).toBeDefined()
      expect(ADVISOR_LEGAL_SOURCES[copy!.sourceId]).toBeDefined()
    }
    expect(GATE_COPY['haushalt-gate']?.sourceId).toBe('estg-35a')
    expect(GATE_COPY['gesundheit-gate']?.sourceId).toBe('estg-33')
  })
})

describe('deriveGateAnswers', () => {
  it('opens the gate behind a drafted amount when the gate is not answered', () => {
    const derived = deriveGateAnswers(BASE, { 'haushalt-handwerker-betrag': '10618', 'haushalt-handwerker-rechnungsbetrag': '14000' })
    expect(derived).toEqual([
      {
        field: 'haushalt-gate',
        value: 'Ja',
        label: 'Haushaltsnahe Aufwendungen: Ja',
        reason: expect.stringContaining('nur, wenn diese Frage mit „Ja“ beantwortet ist'),
        sourceId: 'estg-35a',
      },
    ])
  })

  it('covers health costs and prepayments too', () => {
    expect(deriveGateAnswers(BASE, { 'gesundheit-betrag': '900' }).map((d) => `${d.field}=${d.value}:${d.sourceId}`)).toEqual(['gesundheit-gate=Ja:estg-33'])
    expect(deriveGateAnswers(BASE, { 'vorauszahlungen-betrag': '4800' }).map((d) => d.field)).toEqual(['vorauszahlungen-gate'])
  })

  it('derives nothing while the answered gates are unknown', () => {
    const { answeredGates: _drop, ...unknown } = BASE
    expect(deriveGateAnswers(unknown, { 'haushalt-handwerker-betrag': '10618' })).toEqual([])
  })

  it('never overrides an answer, and leaves a gate drafted in this turn alone', () => {
    expect(deriveGateAnswers({ ...BASE, answeredGates: { 'haushalt-gate': 'Ja' } }, { 'haushalt-handwerker-betrag': '10618' })).toEqual([])
    expect(deriveGateAnswers({ ...BASE, answeredGates: { 'haushalt-gate': 'Nein' } }, { 'haushalt-handwerker-betrag': '10618' })).toEqual([])
    expect(deriveGateAnswers(BASE, { 'haushalt-handwerker-betrag': '10618', 'haushalt-gate': 'Ja' })).toEqual([])
    expect(deriveGateAnswers(BASE, { 'haushalt-handwerker-betrag': '10618', 'haushalt-gate': 'Nein' })).toEqual([])
  })

  it('opens no gate for an amount of 0 or for fields without a gate', () => {
    expect(deriveGateAnswers(BASE, { 'gesundheit-betrag': '0' })).toEqual([])
    expect(deriveGateAnswers(BASE, { job: 'Angestellt', kinder: 'Nein' })).toEqual([])
  })
})
