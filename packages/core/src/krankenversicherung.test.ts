import { describe, expect, it } from 'vitest'
import { angestellteAusAntworten } from './angestellte'
import { ENTRIES, nextStepFor, type Answers } from './interview'
import { healthInsuranceFromAnswers } from './krankenversicherung'

const SONDERAUSGABEN = ENTRIES.sonderausgaben

describe('self-paid health and care insurance (Anlage Vorsorgeaufwand Z. 16–33)', () => {
  it('asks the kind of insurance, the Krankengeld claim, KV, PV and the extras after "Ja"', () => {
    const answers: Answers = { spenden: 'Nein', 'kv-pv': 'Ja' }
    expect(nextStepFor(SONDERAUSGABEN, answers)).toEqual({ kind: 'question', id: 'kv-pv-art' })
    expect(nextStepFor(SONDERAUSGABEN, { ...answers, 'kv-pv-art': 'Gesetzlich (freiwillig)' })).toEqual({ kind: 'question', id: 'kv-krankengeld' })
    expect(nextStepFor(SONDERAUSGABEN, { ...answers, 'kv-pv-art': 'Privat' })).toEqual({ kind: 'question', id: 'kv-pv-betrag' })
    expect(
      nextStepFor(SONDERAUSGABEN, { ...answers, 'kv-pv-art': 'Privat', 'kv-pv-betrag': '3000' }),
    ).toEqual({ kind: 'question', id: 'pv-betrag' })
    expect(
      nextStepFor(SONDERAUSGABEN, { ...answers, 'kv-pv-art': 'Privat', 'kv-pv-betrag': '3000', 'pv-betrag': '600' }),
    ).toEqual({ kind: 'question', id: 'kv-wahl-betrag' })
  })

  it('reads the answers into the form figures', () => {
    expect(
      healthInsuranceFromAnswers({
        'kv-pv': 'Ja',
        'kv-pv-art': 'Gesetzlich (freiwillig)',
        'kv-krankengeld': 'Ja',
        'kv-pv-betrag': '3000',
        'pv-betrag': '600',
        'kv-wahl-betrag': '200',
      }),
    ).toEqual({ kind: 'gesetzlich', basicHealthAmount: 3000, withSickPay: true, careInsuranceAmount: 600, optionalExtrasAmount: 200 })
    expect(healthInsuranceFromAnswers({ 'kv-pv': 'Nein' })).toBeNull()
  })

  it('counts KV less 4 % when it carries a Krankengeld claim, plus PV, for the estimate (§ 10 Abs. 1 Nr. 3 EStG)', () => {
    const answers: Answers = {
      'kv-pv': 'Ja',
      'kv-pv-art': 'Gesetzlich (freiwillig)',
      'kv-krankengeld': 'Ja',
      'kv-pv-betrag': '3000',
      'pv-betrag': '600',
      'kv-wahl-betrag': '200',
    }
    expect(angestellteAusAntworten(answers).kvPvBeitraege).toBe(2880 + 600)
    expect(angestellteAusAntworten({ ...answers, 'kv-krankengeld': 'Nein' }).kvPvBeitraege).toBe(3000 + 600)
  })
})
