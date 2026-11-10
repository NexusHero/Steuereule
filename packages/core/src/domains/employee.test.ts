import { describe, expect, it } from 'vitest'
import { employeeFromAnswers, employeeFromData, calculateEmployeeStatus, type EmployeeInputs } from './employee'
import { ENTRIES, entryForStep, isReachableFor, nextStepFor, remainingStepsFor, type Answers } from '../interview/interview'
import { EMPTY_WAGE_TAX_CERTIFICATE, type WageTaxCertificateData } from './lstb'

const INPUTS: EmployeeInputs = {
  income: 50000,
  incomeRelatedExpenses: 1200,
  specialExpenses: 3000,
  openItems: 0,
  conflicts: 0,
  gated: [],
}

describe('employeeFromAnswers — the catalogue answers feed the Rechenkern', () => {
  it('empty answers parse to all-zero figures', () => {
    expect(employeeFromAnswers({})).toEqual({
      sideJobGross: 0,
      relocationCosts: 0,
      donations: 0,
      healthCareContributions: 0,
      riester: 0,
      doubleHouseholdRent: 0,
      severanceAmount: 0,
      wageReplacementAmount: 0,
    })
  })

  it('"Ja" opens the integer follow-up, "Nein" closes it', () => {
    const answers: Answers = {
      umzug: 'Ja',
      'umzug-kosten': '800',
      spenden: 'Nein',
      dhf: 'Ja',
      'dhf-miete': '650',
      abfindung: 'Ja',
      'abfindung-betrag': '20000',
      lohnersatz: 'Ja',
      'lohnersatz-betrag': '4000',
    }
    expect(employeeFromAnswers(answers)).toEqual({
      sideJobGross: 0,
      relocationCosts: 800,
      donations: 0,
      healthCareContributions: 0,
      riester: 0,
      doubleHouseholdRent: 650,
      severanceAmount: 20000,
      wageReplacementAmount: 4000,
    })
  })

  it('Minijob carries no amount (steuerfrei), Midijob/Nebenjob read the Brutto', () => {
    expect(employeeFromAnswers({ nebenjob: 'Minijob', 'nebenjob-brutto': '500' }).sideJobGross).toBe(0)
    expect(employeeFromAnswers({ nebenjob: 'Nebenjob', 'nebenjob-brutto': '6000' }).sideJobGross).toBe(6000)
  })

  it('treats AMOUNT_LATER on catalog deduction amounts as 0 € and never NaN', () => {
    const figures = employeeFromAnswers({
      umzug: 'Ja',
      'umzug-kosten': 'spaeter',
      spenden: 'Ja',
      'spenden-betrag': 'spaeter',
      riester: 'Ja',
      'riester-betrag': 'spaeter',
      dhf: 'Ja',
      'dhf-miete': 'spaeter',
    })
    expect(figures).toEqual({
      sideJobGross: 0,
      relocationCosts: 0,
      donations: 0,
      healthCareContributions: 0,
      riester: 0,
      doubleHouseholdRent: 0,
      severanceAmount: 0,
      wageReplacementAmount: 0,
    })
  })
})

describe('angestelltenStand — the deterministic fold', () => {
  it('nothing open/conflicting/gated → bestimmt, einkuenfte = einnahmen − werbungskosten', () => {
    expect(calculateEmployeeStatus(INPUTS)).toEqual({
      kind: 'bestimmt',
      einnahmen: 50000,
      werbungskosten: 1200,
      specialExpenses: 3000,
      netIncome: 48800,
    })
  })

  it('sonderausgaben are reported, never subtracted (the aggregation is a later slice)', () => {
    const r = calculateEmployeeStatus(INPUTS)
    expect(r.kind === 'bestimmt' ? r.netIncome : 0).toBe(48800) // 50000 − 1200, NOT − 3000
  })

  it('open inputs → offen, naming the count', () => {
    const r = calculateEmployeeStatus({ ...INPUTS, openItems: 2 })
    expect(r.kind).toBe('offen')
    expect((r as { openItems: number }).openItems).toBe(2)
  })

  it('a gated Einkunftsart → offen, naming it', () => {
    const r = calculateEmployeeStatus({ ...INPUTS, gated: ['Gewerbe'] })
    expect(r).toMatchObject({ kind: 'offen', gated: ['Gewerbe'] })
  })

  it('werbungskosten exceeding einnahmen floors einkuenfte at 0, never negative', () => {
    const r = calculateEmployeeStatus({ ...INPUTS, incomeRelatedExpenses: 99999 })
    expect(r.kind === 'bestimmt' ? r.netIncome : null).toBe(0)
  })

  it('rejects negative or non-integer inputs', () => {
    expect(() => calculateEmployeeStatus({ ...INPUTS, income: -1 })).toThrow(RangeError)
    expect(() => calculateEmployeeStatus({ ...INPUTS, specialExpenses: 1.5 })).toThrow(RangeError)
  })
})

describe('angestellteAusDaten — the ONE fold shared by Cockpit API + Plausibilitäts-Screen (ticket 15 review F2)', () => {
  const COMPLETE: WageTaxCertificateData = {
    bruttoarbeitslohn: { kind: 'erfasst', value: 50000 },
    lohnsteuer: { kind: 'erfasst', value: 8000 },
    sozialversicherung: { kind: 'erfasst', value: 9000 },
  }

  it('empty answers + empty LStB fold to all-zero facts, nothing gated', () => {
    expect(employeeFromData(EMPTY_WAGE_TAX_CERTIFICATE, {})).toEqual({
      einnahmen: 0,
      werbungskosten: 0,
      specialExpenses: 0,
      openItems: 0,
      conflicts: 0,
      gated: [],
      recordedNotCalculated: 0,
    })
  })

  it('sums LStB Brutto (Angestellte vertical only) + declared Nebenjob-Brutto', () => {
    expect(employeeFromData(COMPLETE, { job: 'Angestellt', nebenjob: 'Nebenjob', 'nebenjob-brutto': '4000' }).einnahmen).toBe(54000)
    // A pensioner has no LStB to transcribe, so the (present) LStB must not fold into income.
    expect(employeeFromData(COMPLETE, { job: 'Rente' }).einnahmen).toBe(0)
  })

  it('counts open LStB fields only for the Angestellte vertical', () => {
    const open: WageTaxCertificateData = { bruttoarbeitslohn: { kind: 'erfasst', value: 50000 }, lohnsteuer: { kind: 'offen' }, sozialversicherung: { kind: 'offen' } }
    expect(employeeFromData(open, { job: 'Angestellt' }).openItems).toBe(2)
    expect(employeeFromData(open, { job: 'Rente' }).openItems).toBe(0)
  })

  it('counts a declared Nebenjob without Brutto as an open Posten (never Minijob)', () => {
    expect(employeeFromData(COMPLETE, { job: 'Angestellt', nebenjob: 'Nebenjob' }).openItems).toBe(1)
    expect(employeeFromData(COMPLETE, { job: 'Angestellt', nebenjob: 'Minijob' }).openItems).toBe(0)
  })

  it('counts an LStB widerspruch as a conflict (ADR-008)', () => {
    const conflict: WageTaxCertificateData = { bruttoarbeitslohn: { kind: 'erfasst', value: 50000 }, lohnsteuer: { kind: 'erfasst', value: 60000 }, sozialversicherung: { kind: 'erfasst', value: 0 } }
    expect(employeeFromData(conflict, { job: 'Angestellt' }).conflicts).toBe(1)
  })

  it('names a gated Einkunftsart and sums the captured-but-not-folded amounts', () => {
    const facts = employeeFromData(COMPLETE, {
      job: 'Beides',
      dhf: 'Ja',
      'dhf-miete': '650',
      abfindung: 'Ja',
      'abfindung-betrag': '20000',
      lohnersatz: 'Ja',
      'lohnersatz-betrag': '4000',
    })
    expect(facts.gated).toEqual(['Gewerbe'])
    expect(facts.recordedNotCalculated).toBe(650 + 20000 + 4000)
  })
})

describe('Lebenslagen/Sonderausgaben catalogue entries — one walker, one registry (ADR-0031 §3)', () => {
  it('entryForStep derives the owning entry for every new step id', () => {
    expect(entryForStep('dhf')).toBe('lebenslagen')
    expect(entryForStep('dhf-miete')).toBe('lebenslagen')
    expect(entryForStep('nebenjob-brutto')).toBe('lebenslagen')
    expect(entryForStep('spenden')).toBe('sonderausgaben')
    expect(entryForStep('riester-betrag')).toBe('sonderausgaben')
  })

  it('the Lebenslagen entry walks its top-level questions, opening the integer follow-up on "Ja"', () => {
    const entry = ENTRIES.lebenslagen
    expect(nextStepFor(entry, {})).toEqual({ kind: 'question', id: 'dhf' })
    expect(nextStepFor(entry, { dhf: 'Ja' })).toEqual({ kind: 'question', id: 'dhf-miete' })
    expect(nextStepFor(entry, { dhf: 'Ja', 'dhf-miete': '650' })).toEqual({ kind: 'question', id: 'umzug' })
    expect(nextStepFor(entry, { dhf: 'Nein' })).toEqual({ kind: 'question', id: 'umzug' })
  })

  it('the Sonderausgaben entry walks its three top-level questions', () => {
    const entry = ENTRIES.sonderausgaben
    expect(nextStepFor(entry, {})).toEqual({ kind: 'question', id: 'spenden' })
    expect(nextStepFor(entry, { spenden: 'Ja' })).toEqual({ kind: 'question', id: 'spenden-betrag' })
    expect(remainingStepsFor(entry, {})).toBe(3)
    expect(remainingStepsFor(entry, { spenden: 'Ja' })).toBe(3) // the amount follow-up is the open one
  })

  it('isReachableFor admits a follow-up only after its "Ja" answer (server-side admission, REQ-015 pattern)', () => {
    const entry = ENTRIES.sonderausgaben
    expect(isReachableFor(entry, {}, 'spenden-betrag')).toBe(false)
    expect(isReachableFor(entry, { spenden: 'Ja' }, 'spenden-betrag')).toBe(true)
  })

  it('Riester asks for the kind of eligibility, and the prior-year earnings only when direct (Anlage AV Zeilen 4/5/14)', () => {
    const entry = ENTRIES.sonderausgaben
    const before = { spenden: 'Nein', 'kv-pv': 'Nein', riester: 'Ja', 'riester-betrag': '600' } as Answers
    expect(nextStepFor(entry, before)).toEqual({ kind: 'question', id: 'riester-art' })
    expect(nextStepFor(entry, { ...before, 'riester-art': 'Unmittelbar' })).toEqual({
      kind: 'question',
      id: 'riester-einnahmen-vorjahr',
    })
    expect(nextStepFor(entry, { ...before, 'riester-art': 'Mittelbar' })).toEqual({ kind: 'done' })
    expect(isReachableFor(entry, { ...before, 'riester-art': 'Mittelbar' }, 'riester-einnahmen-vorjahr')).toBe(false)
  })

  it('the Alleinerziehende entry asks the two household questions of Anlage Kind Zeilen 47/48', () => {
    const entry = ENTRIES.alleinerziehend
    expect(nextStepFor(entry, {})).toEqual({ kind: 'question', id: 'ae-weitere-person' })
    expect(nextStepFor(entry, { 'ae-weitere-person': 'Nein' })).toEqual({ kind: 'question', id: 'ae-haushaltsgemeinschaft' })
    expect(nextStepFor(entry, { 'ae-weitere-person': 'Nein', 'ae-haushaltsgemeinschaft': 'Nein' })).toEqual({ kind: 'done' })
    expect(entryForStep('ae-haushaltsgemeinschaft')).toBe('alleinerziehend')
  })

  it('nebenjob only opens the Brutto follow-up for Midijob/Nebenjob, not Minijob/Nein', () => {
    const entry = ENTRIES.lebenslagen
    const prefix = { dhf: 'Nein', umzug: 'Nein', abfindung: 'Nein', lohnersatz: 'Nein' } as Answers
    expect(nextStepFor(entry, prefix)).toEqual({ kind: 'question', id: 'nebenjob' })
    expect(nextStepFor(entry, { ...prefix, nebenjob: 'Minijob' })).toEqual({ kind: 'done' })
    expect(nextStepFor(entry, { ...prefix, nebenjob: 'Nebenjob' })).toEqual({ kind: 'question', id: 'nebenjob-brutto' })
  })
})
