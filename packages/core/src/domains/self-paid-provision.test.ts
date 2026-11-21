import { describe, expect, it } from 'vitest'
import { ENTRIES, isReachableFor, nextStepFor, type Answers } from '../interview/interview'
import { deductibleProvision } from './provision'
import { declaresBusiness, paysOwnProvision, selfPaidProvisionFromAnswers } from './self-paid-provision'

const SPECIAL_EXPENSES = ENTRIES.sonderausgaben
const MINIMAL_GATE = ENTRIES['minimal-gate']
const SWITCH_ON = { selfEmployment: true }

const statutoryWithSickPay: Answers = {
  job: 'Selbstständig',
  'kv-pv': 'Ja',
  'kv-pv-art': 'Gesetzlich (freiwillig)',
  'kv-krankengeld': 'Ja',
  'kv-pv-betrag': '3000',
  'pv-betrag': '600',
  'kv-wahl-betrag': '200',
  altersvorsorge: 'Ja',
  'av-rv-betrag': '5000',
  'av-versorgungswerk-betrag': '0',
  'av-basisrente-betrag': '2000',
  'av-ksk': 'Nein',
  versicherungen: 'Ja',
  'versicherungen-betrag': '400',
}

describe('provision the self-employed pay themselves (Anlage Vorsorgeaufwand, § 10 Abs. 1 Nr. 2, 3, 3a EStG)', () => {
  it('reads KV, PV, pension and other insurance into the provision lines, the KV unreduced', () => {
    expect(selfPaidProvisionFromAnswers(statutoryWithSickPay)).toEqual({
      pensionOwnEur: 7000,
      pensionEmployerEur: 0,
      healthBasicEur: 3000,
      healthWithSickPayEur: 3000,
      careEur: 600,
      employerSubsidyEur: 0,
      otherEur: 600,
      reducedOtherCap: false,
    })
  })

  it('cuts the Krankengeld 4 % once, on the KV only, never on the care insurance', () => {
    const d = deductibleProvision(2025, [selfPaidProvisionFromAnswers(statutoryWithSickPay)])
    expect(d.sickPayCutEur).toBe(120)
    expect(d.basicEur).toBe(3480)
    expect(d.pensionEur).toBe(7000)
    expect(d.totalEur).toBe(10_480)
  })

  it('cuts nothing for a private insurance without Krankengeld', () => {
    const p = selfPaidProvisionFromAnswers({ ...statutoryWithSickPay, 'kv-pv-art': 'Privat', 'kv-krankengeld': undefined as unknown as string })
    expect(p.healthWithSickPayEur).toBe(0)
    expect(deductibleProvision(2025, [p]).sickPayCutEur).toBe(0)
  })

  it('takes the 1.900 € cap for a member of the Künstlersozialkasse, which pays half of the KV (§ 10 Abs. 4 Satz 2 EStG)', () => {
    expect(selfPaidProvisionFromAnswers({ ...statutoryWithSickPay, 'av-ksk': 'Ja' }).reducedOtherCap).toBe(true)
  })

  it('counts a Versorgungswerk like the statutory pension, up to the Höchstbetrag', () => {
    const p = selfPaidProvisionFromAnswers({ ...statutoryWithSickPay, 'av-rv-betrag': '0', 'av-basisrente-betrag': '0', 'av-versorgungswerk-betrag': '40000' })
    expect(p.pensionOwnEur).toBe(40_000)
    // 2025: Höchstbetrag 29.344 € (§ 10 Abs. 3 Satz 1 EStG, Beitragsbemessungsgrenze knappschaftliche RV × 24,7 %).
    expect(deductibleProvision(2025, [p]).pensionEur).toBe(29_344)
  })

  it('reads nothing without answers', () => {
    expect(selfPaidProvisionFromAnswers({ job: 'Selbstständig' })).toEqual({
      pensionOwnEur: 0,
      pensionEmployerEur: 0,
      healthBasicEur: 0,
      healthWithSickPayEur: 0,
      careEur: 0,
      employerSubsidyEur: 0,
      otherEur: 0,
      reducedOtherCap: false,
    })
  })
})

describe('who declares a business and who pays the provision himself', () => {
  it('knows the self-employed, the employee with a business and the pensioner with one', () => {
    expect(declaresBusiness({ job: 'Selbstständig' })).toBe(true)
    expect(declaresBusiness({ job: 'Beides' })).toBe(true)
    expect(declaresBusiness({ job: 'Rente', 'rente-selbststaendig': 'Ja' })).toBe(true)
    expect(declaresBusiness({ job: 'Rente', 'rente-selbststaendig': 'Nein' })).toBe(false)
    expect(declaresBusiness({ job: 'Angestellt' })).toBe(false)
  })

  it('has a person without a wage pay the provision himself', () => {
    expect(paysOwnProvision({ job: 'Selbstständig' })).toBe(true)
    expect(paysOwnProvision({ job: 'Rente', 'rente-selbststaendig': 'Ja' })).toBe(true)
    expect(paysOwnProvision({ job: 'Beides' })).toBe(false)
    expect(paysOwnProvision({ job: 'Angestellt' })).toBe(false)
  })
})

describe('the interview asks for it', () => {
  it('asks a pensioner about a business only with the switch on', () => {
    expect(nextStepFor(MINIMAL_GATE, { job: 'Rente' }, SWITCH_ON)).toEqual({ kind: 'question', id: 'rente-selbststaendig' })
    expect(nextStepFor(MINIMAL_GATE, { job: 'Rente' })).toEqual({ kind: 'question', id: 'ausland' })
  })

  it('asks the self-employed for pension and other insurance after the Riester question', () => {
    const answers: Answers = { job: 'Selbstständig', spenden: 'Nein', 'kv-pv': 'Nein', riester: 'Nein' }
    expect(nextStepFor(SPECIAL_EXPENSES, answers, SWITCH_ON)).toEqual({ kind: 'question', id: 'altersvorsorge' })
    expect(nextStepFor(SPECIAL_EXPENSES, { ...answers, altersvorsorge: 'Ja' }, SWITCH_ON)).toEqual({ kind: 'question', id: 'av-rv-betrag' })
    expect(nextStepFor(SPECIAL_EXPENSES, { ...answers, altersvorsorge: 'Nein' }, SWITCH_ON)).toEqual({ kind: 'question', id: 'versicherungen' })
  })

  it('asks it without the switch option too: the catalogue and the Strom topic pages walk the graph without it (E2E finding)', () => {
    const answers: Answers = { job: 'Selbstständig', spenden: 'Nein', 'kv-pv': 'Nein', riester: 'Nein' }
    expect(nextStepFor(SPECIAL_EXPENSES, answers)).toEqual({ kind: 'question', id: 'altersvorsorge' })
    expect(nextStepFor(SPECIAL_EXPENSES, { ...answers, altersvorsorge: 'Ja' })).toEqual({ kind: 'question', id: 'av-rv-betrag' })
  })

  it('admits the answers on the server, which reads the basis from the stored answers (09b in CI, 21.11.2026)', () => {
    const stored: Answers = { job: 'Selbstständig', ausland: 'Nein', kinder: 'Nein', familienstand: 'Ledig', spenden: 'Nein', 'kv-pv': 'Nein', riester: 'Nein' }
    expect(isReachableFor(SPECIAL_EXPENSES, stored, 'altersvorsorge', SWITCH_ON)).toBe(true)
    expect(isReachableFor(SPECIAL_EXPENSES, { ...stored, altersvorsorge: 'Nein' }, 'versicherungen', SWITCH_ON)).toBe(true)
    expect(isReachableFor(SPECIAL_EXPENSES, { ...stored, job: 'Angestellt', altersvorsorge: 'Nein' }, 'versicherungen', SWITCH_ON)).toBe(false)
  })

  it('does not ask an employee, whose pension stands on the wage tax certificate', () => {
    expect(nextStepFor(SPECIAL_EXPENSES, { job: 'Angestellt', spenden: 'Nein', 'kv-pv': 'Nein', riester: 'Nein' }, SWITCH_ON)).toEqual({ kind: 'done' })
  })
})
