import { describe, expect, it } from 'vitest'
import { assessmentPeriodEnd, assessmentPeriodEndIfMandatory, filedElsewhereState, openAssessmentPeriodYears, yearDeadline } from './history-years'

// ADR-0099 §1 — „Hier liegt noch Geld“: the four years a return can still be filed, their deadlines and
// the one-time question „Schon abgegeben?“.

describe('assessmentPeriodEnd', () => {
  it('is the voluntary filing deadline of the tariff years, holidays included', () => {
    expect(assessmentPeriodEnd(2022)).toBe('2026-12-31')
    // 31.12.2028 is a Sunday, 01.01.2029 a holiday (§ 108 Abs. 3 AO).
    expect(assessmentPeriodEnd(2024)).toBe('2029-01-02')
  })

  it('follows the same rule for years outside the tariff years', () => {
    // 31.12.2025 is a Wednesday.
    expect(assessmentPeriodEnd(2021)).toBe('2025-12-31')
    // 31.12.2023 is a Sunday, 01.01.2024 a holiday.
    expect(assessmentPeriodEnd(2019)).toBe('2024-01-02')
  })
})

describe('assessmentPeriodEndIfMandatory', () => {
  it('starts the four years at the end of the filing year (§ 170 Abs. 2 Nr. 1 AO)', () => {
    expect(assessmentPeriodEndIfMandatory(2023, '2024-03-18')).toBe('2029-01-02')
  })

  it('delays the start by three years at most', () => {
    expect(assessmentPeriodEndIfMandatory(2021, '2026-05-01')).toBe(assessmentPeriodEnd(2024))
  })
})

describe('openAssessmentPeriodYears', () => {
  it('lists the four years before the current one whose period still runs', () => {
    expect(openAssessmentPeriodYears('2026-11-19')).toEqual([2022, 2023, 2024, 2025])
  })

  it('drops a year the day after its period ended', () => {
    expect(openAssessmentPeriodYears('2027-01-01')).toEqual([2023, 2024, 2025, 2026])
  })
})

describe('yearDeadline', () => {
  it('names the last day for a voluntary return of a year without a Bescheid', () => {
    expect(yearDeadline({ year: 2022, assessed: false, filedOn: null }, '2026-11-19')).toEqual({
      kind: 'abgabe-moeglich-bis',
      endsOn: '2026-12-31',
      remainingDays: 42,
      running: true,
      endsOnIfMandatory: null,
    })
  })

  it('names until when a year with a Bescheid can be changed, and the later end of a mandatory return', () => {
    expect(yearDeadline({ year: 2023, assessed: true, filedOn: '2024-03-18' }, '2026-11-19')).toMatchObject({
      kind: 'aenderbar-bis',
      endsOn: '2027-12-31',
      running: true,
      endsOnIfMandatory: '2029-01-02',
    })
  })

  it('has no later end without a filing date', () => {
    expect(yearDeadline({ year: 2023, assessed: true, filedOn: null }, '2026-11-19').endsOnIfMandatory).toBeNull()
  })
})

describe('filedElsewhereState', () => {
  const today = '2026-11-19'

  it('asks once while there is no answer', () => {
    expect(filedElsewhereState(2023, null, today)).toEqual({ answer: null, answeredOn: null, askAgainFrom: null, ask: true })
  })

  it('does not ask again after „Ja“ or „Nein“', () => {
    expect(filedElsewhereState(2023, { answer: 'ja', answeredOn: '2026-11-01' }, today).ask).toBe(false)
    expect(filedElsewhereState(2023, { answer: 'nein', answeredOn: '2026-11-01' }, today).ask).toBe(false)
  })

  it('asks again three months before the deadline after „Weiß nicht“', () => {
    const state = filedElsewhereState(2023, { answer: 'weiss-nicht', answeredOn: '2026-11-01' }, today)
    expect(state).toEqual({ answer: 'weiss-nicht', answeredOn: '2026-11-01', askAgainFrom: '2027-09-30', ask: false })
    expect(filedElsewhereState(2023, { answer: 'weiss-nicht', answeredOn: '2026-11-01' }, '2027-09-30').ask).toBe(true)
  })

  it('asks again at once when the deadline is less than three months away', () => {
    expect(filedElsewhereState(2022, { answer: 'weiss-nicht', answeredOn: '2026-11-01' }, today)).toMatchObject({ askAgainFrom: '2026-09-30', ask: true })
  })

  it('stops asking once the period is over', () => {
    expect(filedElsewhereState(2022, null, '2027-01-01').ask).toBe(false)
  })
})
