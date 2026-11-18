// Fast, no-DB tier (ADR-0004): the Verlauf service against fakes. The household is the mock's
// (docs/mocks/steuer-verlauf.html, ADR-0098): an Eckjahr 2021, the joint 2024 with Person A's
// Werbungskosten cut, 2025 submitted without a Bescheid, 2026 still open.
import { describe, expect, it } from 'vitest'
import type { AssessmentPositionValues } from '@steuereule/core'
import type { AssessmentRecord } from '../src/assessment/assessment.repository.js'
import type { CommuteInputs, CommuteRepository } from '../src/commute/commute.repository.js'
import { TaxEstimateService } from '../src/tax-estimate/tax-estimate.service.js'
import type { HistoryYearRecord, YearHistoryRepository } from '../src/year-history/year-history.repository.js'
import { YearHistoryService } from '../src/year-history/year-history.service.js'
import { toYearHistoryDto } from '../src/year-history/year-history.mapper.js'
import { FakeAssessmentRepository } from './fakes/fake-assessment.repository.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeFilingVersionRepository } from './fakes/fake-filing-version.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeLinkRepository } from './fakes/fake-link.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeMasterDataRepository } from './fakes/fake-master-data.repository.js'

const USER = 'user-a'
const spouse = (year: number) => `spouse_${USER}_${year}`
const TODAY = '2026-11-18'

const filed2024: AssessmentPositionValues = {
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
}

function assessment(taxYear: number, values: Record<string, number>, extra: Partial<AssessmentRecord> = {}): AssessmentRecord {
  const s = (v: number | undefined) => (v === undefined ? null : String(v))
  const { vorsorgeaufwand, anrechnung, festgesetzteSteuer, erstattung, ...positions } = values
  return {
    userId: USER,
    taxYear,
    status: 'eingegangen',
    assessmentDate: null,
    appealReason: null,
    fields: { einnahmen: null, vorsorgeaufwand: s(vorsorgeaufwand), anrechnung: s(anrechnung), festgesetzteSteuer: s(festgesetzteSteuer), erstattung: s(erstattung) },
    positions: Object.fromEntries(Object.entries(positions).map(([k, v]) => [k, String(v)])),
    explanations: null,
    ...extra,
  }
}

function setup() {
  const years: HistoryYearRecord[] = [
    { year: 2021, status: 'extern-erledigt' },
    { year: 2024, status: 'bescheid' },
    { year: 2025, status: 'eingereicht' },
    { year: 2026, status: 'entwurf' },
  ]
  const yearRepo: YearHistoryRepository = { yearsOf: async () => years }
  const assessments = new FakeAssessmentRepository()
  const versions = new FakeFilingVersionRepository()
  const lstb = new FakeLstbRepository()
  const ch = new FakeChSalaryCertificateRepository()
  const interview = new FakeInterviewAnswerRepository()
  const link = new FakeLinkRepository()
  const commutes = new Map<string, CommuteInputs>()
  const commute: CommuteRepository = { findForUserAndYear: async (u, y) => commutes.get(`${u}:${y}`) ?? null, save: async (_u, _y, e) => e }
  const estimates = new TaxEstimateService(lstb, interview, ch, new FakeMasterDataRepository(), commute, link)

  assessments.seed(assessment(2021, { werbungskostenA: 1_850, festgesetzteSteuer: 6_410, erstattung: 280 }))
  for (const year of [2024, 2025, 2026]) void link.upsert(USER, year, { personBUserId: spouse(year), filingType: 'zusammen' })
  lstb.seed({ userId: USER, taxYear: 2024, bruttoarbeitslohn: '54900', lohnsteuer: '8489', sozialversicherung: '11420' })
  lstb.seed({ userId: spouse(2024), taxYear: 2024, bruttoarbeitslohn: '39000', lohnsteuer: '4490', sozialversicherung: '8110' })
  versions.seed({ userId: USER, taxYear: 2024, number: 1, filingType: 'zusammen', submittedOn: '2026-09-21', positions: filed2024, estimateAtSubmission: { from: 700, to: 1_050 } })
  assessments.seed(
    assessment(
      2024,
      { ...filed2024, homeofficeA: 1_080, arbeitsmittelA: 260, werbungskostenA: 2_660, zuVersteuerndesEinkommen: 71_271, festgesetzteSteuer: 12_170, erstattung: 809 },
      { assessmentDate: '2026-11-02', explanations: 'Die Tätigkeit in der häuslichen Wohnung wurde an 180 statt 210 Tagen berücksichtigt.' },
    ),
  )
  lstb.seed({ userId: USER, taxYear: 2025, bruttoarbeitslohn: '58300', lohnsteuer: '9205', sozialversicherung: '12300' })
  lstb.seed({ userId: spouse(2025), taxYear: 2025, bruttoarbeitslohn: '41200', lohnsteuer: '4861', sozialversicherung: '8690' })
  interview.seed(USER, 2025, { job: 'Angestellt', familienstand: 'Verheiratet', ausland: 'Nein', kinder: 'Nein' })
  versions.seed({
    userId: USER,
    taxYear: 2025,
    number: 1,
    filingType: 'zusammen',
    submittedOn: '2026-10-05',
    positions: { ...filed2024, bruttoarbeitslohnA: 58_300, bruttoarbeitslohnB: 41_200, homeofficeA: 1_260, arbeitsmittelA: 520, erstattung: 1_131 },
    estimateAtSubmission: { from: 1_066, to: 1_196 },
  })
  interview.seed(USER, 2026, { job: 'Angestellt', familienstand: 'Verheiratet', ausland: 'Nein', kinder: 'Nein' })

  const service = new YearHistoryService(yearRepo, assessments, versions, lstb, ch, commute, interview, link, estimates)
  return { service, assessments }
}

describe('YearHistoryService', () => {
  it('lists every year with how it stands, what was declared and assessed, and its deviations', async () => {
    const history = await setup().service.get(USER, TODAY)
    expect(history.list.map((l) => [l.year, l.kind, l.declaredRefund, l.assessedRefund, l.difference, l.deviations, l.noDiffReason])).toEqual([
      [2021, 'eckjahr', null, 280, null, 0, 'eckjahr'],
      [2024, 'bescheid', 901, 809, -92, 2, null],
      [2025, 'eingereicht', 1_131, null, null, 0, 'kein-bescheid'],
      [2026, 'offen', null, null, null, 0, 'kein-bescheid'],
    ])
    expect(history.list.map((l) => l.withinAssessmentPeriod)).toEqual([false, true, true, true])
  })

  it('gives the year tiers from the core: Bescheid, estimate, open', async () => {
    const history = await setup().service.get(USER, TODAY)
    expect(history.years.map((y) => [y.year, y.tier])).toEqual([
      [2021, 'bescheid'],
      [2024, 'bescheid'],
      [2025, 'schaetzung'],
      [2026, 'offen'],
    ])
    expect(history.years[2]!.erstattung.amount.tier).toBe('schaetzung')
    expect(history.years[3]!.missing.length).toBeGreaterThan(0)
  })

  it('puts the running Einspruchsfrist first, then one item per year', async () => {
    const { openItems } = await setup().service.get(USER, TODAY)
    expect(openItems[0]).toEqual({ kind: 'einspruchsfrist', year: 2024, highlighted: true, refundDifference: -92, deviations: 2, deadline: { endsOn: '2026-12-07', remainingDays: 19, running: true } })
    expect(openItems.map((i) => [i.year, i.kind])).toEqual([
      [2024, 'einspruchsfrist'],
      [2025, 'wartet-auf-bescheid'],
      [2026, 'offen'],
    ])
    // 2025 declared the cut positions again — named, without an amount (ADR-0098 §7).
    expect(openItems[1]).toMatchObject({ repeatedCuts: [{ position: 'homeofficeA' }, { position: 'arbeitsmittelA' }] })
    expect(JSON.stringify((openItems[1] as { repeatedCuts: unknown }).repeatedCuts)).not.toMatch(/\d/)
  })

  it('gives the Abgleich of 2024 with its lessons against the frozen 2025', async () => {
    const { diffs } = await setup().service.get(USER, TODAY)
    expect(diffs).toHaveLength(1)
    expect(diffs[0]!.diff.ownDeviations.map((d) => [d.position, d.refundEffect])).toEqual([
      ['homeofficeA', -56],
      ['arbeitsmittelA', -38],
    ])
    expect(diffs[0]!.diff.ownDeviations[0]!.explanation).toContain('180 statt 210')
    expect(diffs[0]!.lessons[0]!.nextYear).toEqual({ year: 2025, source: 'filed', declared: 1_260, declaredAboveRecognised: true })
  })

  it('brings the lessons to the masks of the open year', async () => {
    const { maskLessons } = await setup().service.get(USER, TODAY)
    expect(maskLessons).toMatchObject({ year: 2026, fromYear: 2024 })
    expect(maskLessons!.lessons.map((l) => l.mask?.field)).toEqual(['homeOfficeDays', 'workEquipmentEur'])
  })

  it('maps to the wire with one flat shape per tier', async () => {
    const dto = toYearHistoryDto(await setup().service.get(USER, TODAY))
    const y2025 = dto.years.find((y) => y.year === 2025)!
    expect(y2025.erstattung.amount).toMatchObject({ tier: 'schaetzung', source: 'schaetzung' })
    expect(y2025.erstattung.amount.value).toBeUndefined()
    expect(y2025.netto.A.brutto).toMatchObject({ tier: 'bescheid', value: 58_300, source: 'lohnsteuerbescheinigung', delta: { kind: 'exact', absolute: 3_400 } })
  })

  it('reads nothing of another account', async () => {
    const { service } = setup()
    const other = await service.get('someone-else', TODAY)
    expect(other.diffs).toEqual([])
    expect(other.list.every((l) => l.assessedRefund === null && l.declaredRefund === null)).toBe(true)
  })
})
