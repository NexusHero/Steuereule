import { describe, expect, it } from 'vitest'
import {
  ASSESSMENT_FIELD_IDS,
  ASSESSMENT_NEW_POSITION_IDS,
  ASSESSMENT_POSITION_IDS,
  appealDeadline,
  assessmentLessons,
  diffAssessment,
  employeeLumpSum,
  isValidAssessmentPositionAmount,
  type AssessedReturn,
  type FiledReturn,
} from './assessment'

// ADR-0098 §8 — the Bescheid-Abgleich. The case is the mock's 2024 (docs/mocks/steuer-verlauf.html):
// a joint return where the Finanzamt cut Person A's Werbungskosten by 300 € (Homeoffice 1.260 → 1.080,
// Arbeitsmittel 380 → 260).

const filed2024: FiledReturn = {
  year: 2024,
  filingType: 'zusammen',
  positions: {
    bruttoarbeitslohnA: 54_900,
    bruttoarbeitslohnB: 39_000,
    fahrtwegA: 1_320,
    homeofficeA: 1_260,
    arbeitsmittelA: 380,
    sonstigeWerbungskostenA: 0,
    werbungskostenA: 2_960,
    fahrtwegB: 1_050,
    homeofficeB: 720,
    arbeitsmittelB: 160,
    sonstigeWerbungskostenB: 0,
    werbungskostenB: 1_930,
    vorsorgeaufwand: 17_968,
    sonderausgaben: 72,
    zuVersteuerndesEinkommen: 70_971,
    festgesetzteSteuer: 12_078,
    anrechnung: 12_979,
    erstattung: 901,
  },
}

const assessed2024: AssessedReturn = {
  positions: {
    ...filed2024.positions,
    homeofficeA: 1_080,
    arbeitsmittelA: 260,
    werbungskostenA: 2_660,
    zuVersteuerndesEinkommen: 71_271,
    festgesetzteSteuer: 12_170,
    erstattung: 809,
  },
  explanations: [
    { position: 'homeofficeA', text: 'Die Tätigkeit in der häuslichen Wohnung wurde an 180 statt 210 Tagen berücksichtigt.' },
    { position: null, text: 'Der Bescheid ergeht unter dem Vorbehalt der Nachprüfung.' },
  ],
}

describe('the position catalogue', () => {
  it('keeps the five original fields as positions, so no figure is stored twice', () => {
    for (const id of ['vorsorgeaufwand', 'anrechnung', 'festgesetzteSteuer', 'erstattung']) expect(ASSESSMENT_POSITION_IDS).toContain(id)
    for (const id of ASSESSMENT_NEW_POSITION_IDS) expect(ASSESSMENT_FIELD_IDS).not.toContain(id)
  })

  it('lets only the Abschlusszahlung be negative', () => {
    expect(isValidAssessmentPositionAmount('erstattung', -60)).toBe(true)
    expect(isValidAssessmentPositionAmount('homeofficeA', -1)).toBe(false)
    expect(isValidAssessmentPositionAmount('homeofficeA', 10.5)).toBe(false)
  })

  it('knows the Arbeitnehmer-Pauschbetrag of the years before the tariff years', () => {
    expect(employeeLumpSum(2021)).toBe(1_000)
    expect(employeeLumpSum(2022)).toBe(1_200)
    expect(employeeLumpSum(2024)).toBe(1_230)
    expect(employeeLumpSum(2010)).toBeNull()
  })
})

describe('diffAssessment', () => {
  const diff = diffAssessment(filed2024, assessed2024)

  it('lists only what the Finanzamt changed as own deviations, the largest effect first', () => {
    expect(diff.ownDeviations.map((d) => d.position)).toEqual(['homeofficeA', 'arbeitsmittelA'])
    expect(diff.ownDeviations[0]).toMatchObject({ declared: 1_260, assessed: 1_080, difference: -180, refundEffect: -56 })
    expect(diff.ownDeviations[1]).toMatchObject({ declared: 380, assessed: 260, difference: -120, refundEffect: -38 })
  })

  it('quotes the explanation at its position and keeps the general ones apart', () => {
    expect(diff.ownDeviations[0]!.explanation).toContain('180 statt 210 Tagen')
    expect(diff.generalExplanations).toEqual(['Der Bescheid ergeht unter dem Vorbehalt der Nachprüfung.'])
  })

  it('gives the follow-on changes as one chain, never as deviations', () => {
    expect(diff.followOnChain).toEqual([
      { position: 'werbungskostenA', label: 'Summe Werbungskosten A', difference: -300 },
      { position: 'zuVersteuerndesEinkommen', label: 'Zu versteuerndes Einkommen', difference: 300 },
      { position: 'festgesetzteSteuer', label: 'Einkommensteuer', difference: 92 },
      { position: 'erstattung', label: 'Erstattung', difference: -92 },
    ])
    expect(diff.counts.deviations).toBe(2)
  })

  it('says when the single effects do not add up to the total effect', () => {
    expect(diff.totalRefundEffect).toBe(-92)
    expect(diff.singleEffectsSum).toBe(-94)
    expect(diff.effectsDifferFromTotal).toBe(true)
  })

  it('groups the rows in form order', () => {
    expect(diff.groups.map((g) => g.group)).toEqual(['einkuenfte', 'werbungskostenA', 'werbungskostenB', 'vorsorge', 'steuer'])
    expect(diff.counts).toMatchObject({ positions: 18, same: 12, notRead: 0 })
  })

  it('marks an unread position as not read, never as 0 and never as a deviation', () => {
    const { sonderausgaben: _unread, ...rest } = assessed2024.positions
    const unread = diffAssessment(filed2024, { positions: { ...rest, vorsorgeaufwand: 'not_read' } })
    const row = unread.groups.flatMap((g) => g.rows).find((r) => r.position === 'vorsorgeaufwand')!
    expect(row).toMatchObject({ status: 'not_read', assessed: null, difference: null })
    expect(unread.ownDeviations.map((d) => d.position)).not.toContain('vorsorgeaufwand')
    expect(unread.counts.notRead).toBe(2)
  })

  it('leaves Person B out of a single return', () => {
    const single = diffAssessment({ ...filed2024, filingType: 'einzel' }, assessed2024)
    expect(single.groups.flatMap((g) => g.rows).some((r) => r.person === 'B')).toBe(false)
  })

  it('cannot compute an effect without the declared zvE, tax and refund', () => {
    const { zuVersteuerndesEinkommen: _z, ...rest } = filed2024.positions
    const without = diffAssessment({ ...filed2024, positions: rest }, assessed2024)
    expect(without.ownDeviations[0]!.refundEffect).toBeNull()
    expect(without.singleEffectsSum).toBeNull()
    expect(without.effectsDifferFromTotal).toBe(false)
  })

  it('reports nothing when the Bescheid follows the declaration', () => {
    const same = diffAssessment(filed2024, { positions: filed2024.positions })
    expect(same.ownDeviations).toEqual([])
    expect(same.followOnChain).toEqual([])
    expect(same.effectsDifferFromTotal).toBe(false)
  })
})

describe('assessmentLessons', () => {
  const diff = diffAssessment(filed2024, assessed2024)

  it('names what was recognised, whether 2025 declared it so again, and a catalogue hint with its mask', () => {
    const lessons = assessmentLessons(diff, { year: 2025, source: 'filed', positions: { homeofficeA: 1_260, arbeitsmittelA: 250 } })
    expect(lessons[0]).toMatchObject({
      position: 'homeofficeA',
      recognised: { declared: 1_260, assessed: 1_080, difference: -180 },
      nextYear: { year: 2025, source: 'filed', declared: 1_260, declaredAboveRecognised: true },
      mask: { screen: 'commute', field: 'homeOfficeDays' },
    })
    expect(lessons[0]!.hint).toMatch(/Homeoffice-Tage/)
    expect(lessons[1]!.nextYear).toMatchObject({ declared: 250, declaredAboveRecognised: false })
  })

  it('says nothing about the next year when there is none, and never names an amount for its Bescheid', () => {
    const lessons = assessmentLessons(diff, null)
    expect(lessons.every((l) => l.nextYear === null)).toBe(true)
    expect(JSON.stringify(lessons)).not.toMatch(/refundEffect|erstattung/i)
  })

  it('gives a position without catalogue entry only the first two parts', () => {
    const cut = diffAssessment(filed2024, { positions: { ...filed2024.positions, vorsorgeaufwand: 17_000 } })
    const lesson = assessmentLessons(cut, { year: 2025, source: 'answers', positions: {} })[0]!
    expect(lesson).toMatchObject({ position: 'vorsorgeaufwand', hint: null, mask: null, nextYear: { declared: null, declaredAboveRecognised: null } })
  })
})

describe('appealDeadline (§ 355, § 122 Abs. 2, § 108 Abs. 3 AO)', () => {
  it('runs one month from the fourth day after posting and moves off the weekend', () => {
    // Bescheid of 02.11.2026 → received Fri 06.11.2026 → 06.12.2026 is a Sunday → Mon 07.12.2026.
    expect(appealDeadline('2026-11-02', '2026-11-18')).toEqual({ endsOn: '2026-12-07', remainingDays: 19, running: true })
  })

  it('still runs on its last day and has passed the day after', () => {
    expect(appealDeadline('2026-11-02', '2026-12-07')).toMatchObject({ remainingDays: 0, running: true })
    expect(appealDeadline('2026-11-02', '2026-12-08')).toMatchObject({ remainingDays: -1, running: false })
  })

  it('counts three days for a Bescheid posted before 2025', () => {
    // 22.05.2024 + 3 = Sat 25.05 → received Mon 27.05.2024 → 27.06.2024.
    expect(appealDeadline('2024-05-22', '2026-11-18')).toMatchObject({ endsOn: '2024-06-27', running: false })
  })
})
