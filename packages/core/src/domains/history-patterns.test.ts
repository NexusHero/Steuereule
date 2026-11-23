import { describe, expect, it } from 'vitest'
import { diffAssessment, assessmentLessons, type AssessmentPositionValues } from './assessment'
import { PREPAYMENT_HINT, prepaymentSeries, repeatedCuts } from './history-patterns'

// ADR-0099 §3 (Vorauszahlungen) and §5 (Wiederholt gekürzt): patterns over the user's own Bescheide only.

describe('prepaymentSeries', () => {
  it('flags every Nachzahlung with the hint and counts the run up to the latest Bescheid', () => {
    const series = prepaymentSeries([
      { year: 2022, refund: -1_900, prepayments: 4_000 },
      { year: 2023, refund: 300, prepayments: null },
      { year: 2024, refund: -2_400, prepayments: 6_000 },
      { year: 2025, refund: -2_900, prepayments: 6_000 },
    ])
    expect(series.years.map((y) => [y.year, y.backPayment, y.adjustPrepayments])).toEqual([
      [2022, 1_900, true],
      [2023, null, false],
      [2024, 2_400, true],
      [2025, 2_900, true],
    ])
    expect(series).toMatchObject({ backPaymentYears: 3, consecutiveBackPayments: 2, averageBackPayment: 2_400, hint: PREPAYMENT_HINT })
  })

  it('gives no hint without a Nachzahlung', () => {
    expect(prepaymentSeries([{ year: 2024, refund: 809, prepayments: null }])).toMatchObject({ backPaymentYears: 0, averageBackPayment: null, hint: null })
  })
})

const filed: AssessmentPositionValues = {
  bruttoarbeitslohnA: 54_900,
  bruttoarbeitslohnB: 39_000,
  fahrtwegA: 1_320,
  homeofficeA: 1_260,
  arbeitsmittelA: 380,
  werbungskostenA: 2_960,
  fahrtwegB: 1_050,
  homeofficeB: 720,
  arbeitsmittelB: 160,
  werbungskostenB: 1_930,
  vorsorgeaufwand: 17_968,
  sonderausgaben: 72,
  zuVersteuerndesEinkommen: 70_971,
  festgesetzteSteuer: 12_078,
  anrechnung: 12_979,
  erstattung: 901,
}

function yearDiff(year: number, assessed: AssessmentPositionValues, person: 'A' | 'B' | null = null, filingType: 'einzel' | 'zusammen' = 'zusammen') {
  const diff = diffAssessment({ year, filingType, positions: filed }, { positions: { ...filed, ...assessed } })
  return { year, person, diff, lessons: assessmentLessons(diff, null) }
}

describe('repeatedCuts', () => {
  it('names a position cut in at least two Bescheid years, with its years and the catalogue hint', () => {
    const cuts = repeatedCuts([yearDiff(2023, { homeofficeA: 1_080 }), yearDiff(2024, { homeofficeA: 1_080, arbeitsmittelA: 260 })])
    expect(cuts).toHaveLength(1)
    expect(cuts[0]).toMatchObject({ position: 'homeofficeA', type: 'homeoffice', person: 'A', label: 'Homeoffice-Pauschale' })
    expect(cuts[0]!.years.map((y) => [y.year, y.declared, y.assessed, y.difference])).toEqual([
      [2023, 1_260, 1_080, -180],
      [2024, 1_260, 1_080, -180],
    ])
    expect(cuts[0]!.hint).toMatch(/Homeoffice-Tage/)
  })

  it('needs two years: one cut is no pattern', () => {
    expect(repeatedCuts([yearDiff(2024, { homeofficeA: 1_080 })])).toEqual([])
  })

  it('does not count a change in the user’s favour', () => {
    expect(repeatedCuts([yearDiff(2023, { homeofficeA: 1_400 }), yearDiff(2024, { homeofficeA: 1_400 })])).toEqual([])
  })

  it('reads a single return of Person B as B’s position', () => {
    const cuts = repeatedCuts([yearDiff(2022, { homeofficeA: 1_000 }, 'B', 'einzel'), yearDiff(2023, { homeofficeB: 600 })])
    expect(cuts.map((c) => [c.position, c.person, c.years.map((y) => y.year)])).toEqual([['homeofficeB', 'B', [2022, 2023]]])
  })
})
