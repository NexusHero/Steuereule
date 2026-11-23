// Fast, no-DB tier (ADR-0004): the Verlauf service against fakes. The household is the mock's
// (docs/mocks/steuer-verlauf.html, ADR-0098): an Eckjahr 2021, the joint 2024 with Person A's
// Werbungskosten cut, 2025 submitted without a Bescheid, 2026 still open.
import { describe, expect, it, vi } from 'vitest'
import type { AssessmentPositionValues } from '@steuereule/core'
import type { AssessmentRecord } from '../src/assessment/assessment.repository.js'
import type { CommuteInputs, CommuteRepository } from '../src/commute/commute.repository.js'
import { TaxEstimateService } from '../src/tax-estimate/tax-estimate.service.js'
import type { FiledElsewhereAnswer, TaxYearStatus } from '@steuereule/core'
import { ConflictError, InvalidInputError } from '../src/common/domain-error.js'
import type { HistoryYearRecord, YearHistoryRepository } from '../src/year-history/year-history.repository.js'
import { YearHistoryInsightsService } from '../src/year-history/year-history-insights.service.js'
import { YearHistoryService } from '../src/year-history/year-history.service.js'
import { toYearHistoryDto } from '../src/year-history/year-history.mapper.js'
import { FakeAssessmentRepository } from './fakes/fake-assessment.repository.js'
import { FakeCapitalRepository } from './fakes/fake-capital.repository.js'
import { FakeChildRepository } from './fakes/fake-child.repository.js'
import { FakePensionRepository } from './fakes/fake-pension.repository.js'
import { FakeReceiptRepository } from './fakes/fake-receipt.repository.js'
import { FakeRentalRepository } from './fakes/fake-rental.repository.js'
import { FakeChSalaryCertificateRepository } from './fakes/fake-ch-salary-certificate.repository.js'
import { FakeFilingVersionRepository } from './fakes/fake-filing-version.repository.js'
import { FakeInterviewAnswerRepository } from './fakes/fake-interview-answer.repository.js'
import { FakeLinkRepository } from './fakes/fake-link.repository.js'
import { FakeLstbRepository } from './fakes/fake-lstb.repository.js'
import { FakeMasterDataRepository } from './fakes/fake-master-data.repository.js'
import { taxCaseReaderOver } from '../src/tax-case/repository-tax-case.reader.js'

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

/** The years of the account, with the answer to „Schon abgegeben?“ kept like the tax year row keeps it. */
class FakeYearHistoryRepository implements YearHistoryRepository {
  constructor(private readonly records: HistoryYearRecord[]) {}

  async yearsOf(userId: string): Promise<HistoryYearRecord[]> {
    return userId === USER ? [...this.records].sort((a, b) => a.year - b.year) : []
  }

  /** Test seam: a further year with data. */
  add(r: HistoryYearRecord): void {
    this.records.push(r)
  }

  async setFiledElsewhere(_userId: string, year: number, answer: FiledElsewhereAnswer, answeredOn: string, status: TaxYearStatus): Promise<void> {
    const others = this.records.filter((r) => r.year !== year)
    this.records.splice(0, this.records.length, ...others, { year, status, hasData: false, filedElsewhere: { answer, answeredOn } })
  }
}

const record = (year: number, status: TaxYearStatus): HistoryYearRecord => ({ year, status, hasData: true, filedElsewhere: null })

function setup() {
  const yearRepo = new FakeYearHistoryRepository([record(2021, 'extern-erledigt'), record(2024, 'bescheid'), record(2025, 'eingereicht'), record(2026, 'entwurf')])
  const assessments = new FakeAssessmentRepository()
  const versions = new FakeFilingVersionRepository()
  const lstb = new FakeLstbRepository()
  const ch = new FakeChSalaryCertificateRepository()
  const interview = new FakeInterviewAnswerRepository()
  const link = new FakeLinkRepository()
  const commutes = new Map<string, CommuteInputs>()
  const commute: CommuteRepository = { findForUserAndYear: async (u, y) => commutes.get(`${u}:${y}`) ?? null, save: async (_u, _y, e) => e }
  const estimates = new TaxEstimateService(taxCaseReaderOver({ wageTaxCertificate: lstb, interview, salaryStatement: ch, masterData: new FakeMasterDataRepository(), commute, coupling: link }))

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

  const children = new FakeChildRepository()
  const capital = new FakeCapitalRepository()
  const pension = new FakePensionRepository()
  const rental = new FakeRentalRepository()
  const receipts = new FakeReceiptRepository()
  const insights = new YearHistoryInsightsService(children, capital, pension, rental, commute, receipts)
  const service = new YearHistoryService(yearRepo, assessments, versions, taxCaseReaderOver({ wageTaxCertificate: lstb, salaryStatement: ch, commute, interview, coupling: link }), estimates, insights)
  return { service, assessments, versions, lstb, interview, children, rental, receipts, yearRepo, link, capital, pension }
}

describe('YearHistoryService reads', () => {
  it('reads Kapital and Rente of all years with data in one query each, not one per year', async () => {
    const { service, capital, pension } = setup()
    const perYearCapital = vi.spyOn(capital, 'findForUserAndYear')
    const perYearPension = vi.spyOn(pension, 'findForUserAndYear')
    const batchCapital = vi.spyOn(capital, 'listForUserAndYears')
    const batchPension = vi.spyOn(pension, 'listForUserAndYears')

    await service.get(USER, TODAY)

    expect(perYearCapital).not.toHaveBeenCalled()
    expect(perYearPension).not.toHaveBeenCalled()
    expect(batchCapital).toHaveBeenCalledTimes(1)
    expect(batchPension).toHaveBeenCalledTimes(1)
  })
})

describe('YearHistoryService', () => {
  it('lists every year with how it stands, what was declared and assessed, and its deviations', async () => {
    const history = await setup().service.get(USER, TODAY)
    expect(history.list.map((l) => [l.year, l.kind, l.declaredRefund, l.assessedRefund, l.difference, l.deviations, l.noDiffReason])).toEqual([
      [2021, 'eckjahr', null, 280, null, 0, 'eckjahr'],
      [2022, 'offen', null, null, null, 0, 'kein-bescheid'],
      [2023, 'offen', null, null, null, 0, 'kein-bescheid'],
      [2024, 'bescheid', 901, 809, -92, 2, null],
      [2025, 'eingereicht', 1_131, null, null, 0, 'kein-bescheid'],
      [2026, 'offen', null, null, null, 0, 'kein-bescheid'],
    ])
    expect(history.list.map((l) => l.withinAssessmentPeriod)).toEqual([false, true, true, true, true, true])
  })

  it('gives the year tiers from the core: Bescheid, estimate, open', async () => {
    const history = await setup().service.get(USER, TODAY)
    expect(history.years.map((y) => [y.year, y.tier])).toEqual([
      [2021, 'bescheid'],
      [2022, 'offen'],
      [2023, 'offen'],
      [2024, 'bescheid'],
      [2025, 'schaetzung'],
      [2026, 'offen'],
    ])
    expect(history.years.find((y) => y.year === 2025)!.erstattung.amount.tier).toBe('schaetzung')
    expect(history.years.find((y) => y.year === 2026)!.missing.length).toBeGreaterThan(0)
  })

  it('puts the running Einspruchsfrist first, then one item per year', async () => {
    const { openItems } = await setup().service.get(USER, TODAY)
    expect(openItems[0]).toEqual({ kind: 'einspruchsfrist', year: 2024, highlighted: true, refundDifference: -92, deviations: 2, deadline: { endsOn: '2026-12-07', remainingDays: 19, running: true } })
    expect(openItems.map((i) => [i.year, i.kind])).toEqual([
      [2024, 'einspruchsfrist'],
      [2022, 'offen'],
      [2023, 'offen'],
      [2025, 'wartet-auf-bescheid'],
      [2026, 'offen'],
    ])
    // 2025 declared the cut positions again — named, without an amount (ADR-0098 §7).
    const waiting = openItems.find((i) => i.kind === 'wartet-auf-bescheid')!
    expect(waiting).toMatchObject({ repeatedCuts: [{ position: 'homeofficeA' }, { position: 'arbeitsmittelA' }] })
    expect(JSON.stringify((waiting as { repeatedCuts: unknown }).repeatedCuts)).not.toMatch(/\d/)
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

// ADR-0099 — Hinweise, Lebensereignisse und Gruppen over the same household.
describe('YearHistoryService · ADR-0099', () => {
  describe('§1 gap years and „Schon abgegeben?“', () => {
    it('lists the years of the Festsetzungsfrist without data, asks once, and shows no amount (contract)', async () => {
      const history = await setup().service.get(USER, TODAY)
      const gap = history.list.find((l) => l.year === 2022)!
      expect(gap).toMatchObject({ hasData: false, kind: 'offen', declaredRefund: null, assessedRefund: null, filedElsewhere: { answer: null, ask: true } })
      expect(gap.deadline).toMatchObject({ kind: 'abgabe-moeglich-bis', endsOn: '2026-12-31', running: true })
      // No amount for a year without facts of its own: not exact, not a range.
      const entry = history.years.find((y) => y.year === 2022)!
      for (const figure of [entry.erstattung.amount, entry.steuerquote.incomeTax, entry.netto.beide.brutto]) expect(figure.tier).toBe('offen')
      expect(history.openItems.find((i) => i.year === 2022)).toMatchObject({ kind: 'offen', askFiledElsewhere: true, filingDeadline: '2026-12-31' })
    })

    it('gives the years with data their deadline: „änderbar bis“ once a Bescheid is there', async () => {
      const { list } = await setup().service.get(USER, TODAY)
      expect(list.find((l) => l.year === 2024)!.deadline).toMatchObject({ kind: 'aenderbar-bis', endsOn: '2029-01-02' })
      expect(list.find((l) => l.year === 2024)!.filedElsewhere).toBeNull()
    })

    it('„Ja“: filed elsewhere, waiting for the Bescheid upload, no longer open', async () => {
      const { service } = setup()
      const result = await service.answerFiledElsewhere(USER, 2022, 'ja', TODAY)
      expect(result).toMatchObject({ year: 2022, status: 'extern-erledigt', filedElsewhere: { answer: 'ja', ask: false } })
      const history = await service.get(USER, TODAY)
      expect(history.list.find((l) => l.year === 2022)).toMatchObject({ kind: 'eckjahr', withoutAssessment: true, hasData: false, assessedRefund: null })
      expect(history.openItems.find((i) => i.year === 2022)).toBeUndefined()
    })

    it('„Nein“: an open year with its deadline, without asking again', async () => {
      const { service } = setup()
      await service.answerFiledElsewhere(USER, 2023, 'nein', TODAY)
      const { openItems } = await service.get(USER, TODAY)
      expect(openItems.find((i) => i.year === 2023)).toMatchObject({ kind: 'offen', askFiledElsewhere: false, filingDeadline: '2027-12-31' })
    })

    it('„Weiß nicht“: quiet until three months before the deadline', async () => {
      const { service } = setup()
      const result = await service.answerFiledElsewhere(USER, 2023, 'weiss-nicht', TODAY)
      expect(result.filedElsewhere).toEqual({ answer: 'weiss-nicht', answeredOn: TODAY, askAgainFrom: '2027-09-30', ask: false })
      expect((await service.get(USER, TODAY)).openItems.find((i) => i.year === 2023)).toBeUndefined()
      expect((await service.get(USER, '2027-10-01')).openItems.find((i) => i.year === 2023)).toMatchObject({ askFiledElsewhere: true })
    })

    it('asks only for a year without data and within the four years', async () => {
      const { service } = setup()
      await expect(service.answerFiledElsewhere(USER, 2024, 'ja', TODAY)).rejects.toBeInstanceOf(ConflictError)
      await expect(service.answerFiledElsewhere(USER, 2021, 'ja', TODAY)).rejects.toBeInstanceOf(InvalidInputError)
      await expect(service.answerFiledElsewhere(USER, 2026, 'ja', TODAY)).rejects.toBeInstanceOf(InvalidInputError)
    })
  })

  describe('§2 Kommt jedes Jahr wieder', () => {
    it('lists last year’s items for the open year with the amount as a hint, and never pre-fills (contract)', async () => {
      const { service, interview } = setup()
      interview.seed(USER, 2025, { job: 'Angestellt', familienstand: 'Verheiratet', ausland: 'Nein', kinder: 'Nein', spenden: 'Ja', 'spenden-betrag': '3135' })
      const { recurring } = await service.get(USER, TODAY)
      expect(recurring).toMatchObject({ year: 2026 })
      expect(recurring!.items.find((i) => i.id === 'spenden')).toMatchObject({ lastYear: 2025, lastAmount: 3135, currentAmount: null, status: 'offen' })
      // Nothing was written into the open year.
      const answers2026 = await interview.findAllForUserAndYear(USER, 2026)
      expect(answers2026.some((a) => a.questionId.startsWith('spenden'))).toBe(false)
    })
  })

  describe('§3 Vorauszahlungen', () => {
    it('carries every Bescheid year and flags a Nachzahlung', async () => {
      const { service, assessments } = setup()
      assessments.seed(assessment(2021, { werbungskostenA: 1_850, festgesetzteSteuer: 6_410, erstattung: -1_900 }))
      const { prepayments } = await service.get(USER, TODAY)
      expect(prepayments.years.map((y) => [y.year, y.backPayment, y.adjustPrepayments])).toEqual([
        [2021, 1_900, true],
        [2024, null, false],
      ])
      expect(prepayments.hint).toBe('Vorauszahlungen anpassen lassen (Antrag beim Finanzamt)')
    })
  })

  describe('§4 Lebensereignisse', () => {
    it('derives events only from data: a new employer and a child born', async () => {
      const { service, lstb, children } = setup()
      await lstb.setEmployer(USER, 2024, 'Muster GmbH')
      await lstb.setEmployer(USER, 2025, 'Grenz AG')
      await children.create(USER, 2025, { firstName: 'Mia', lastName: 'Muster', geburtsdatum: '2025-03-14' })
      const { events } = await service.get(USER, TODAY)
      expect(events.map((e) => [e.year, e.kind, e.person])).toEqual([
        [2025, 'neuer-arbeitgeber', 'A'],
        [2025, 'kind', null],
      ])
      expect(events[0]).toMatchObject({ employers: ['Grenz AG'] })
    })

    it('has no events without data (contract)', async () => {
      const { events } = await setup().service.get('someone-else', TODAY)
      expect(events).toEqual([])
    })
  })

  describe('§5 Wiederholt gekürzt', () => {
    it('needs two Bescheid years: one cut is no pattern (contract)', async () => {
      const { repeatedCuts } = await setup().service.get(USER, TODAY)
      expect(repeatedCuts).toEqual([])
    })

    it('names the position cut in 2023 and 2024', async () => {
      const { service, assessments, versions, link, yearRepo } = setup()
      yearRepo.add(record(2023, 'bescheid'))
      void link.upsert(USER, 2023, { personBUserId: spouse(2023), filingType: 'zusammen' })
      versions.seed({ userId: USER, taxYear: 2023, number: 1, filingType: 'zusammen', submittedOn: '2024-03-18', positions: filed2024, estimateAtSubmission: null })
      assessments.seed(assessment(2023, { ...filed2024, homeofficeA: 1_080, werbungskostenA: 2_780, zuVersteuerndesEinkommen: 71_151, festgesetzteSteuer: 12_133, erstattung: 846 }, { assessmentDate: '2024-05-22' }))
      const { repeatedCuts, recurring } = await service.get(USER, TODAY)
      expect(repeatedCuts.map((c) => [c.position, c.years.map((y) => y.year)])).toEqual([['homeofficeA', [2023, 2024]]])
      expect(repeatedCuts[0]!.hint).toMatch(/Homeoffice-Tage/)
      expect(recurring === null || recurring.items.every((i) => i.id !== 'homeoffice' || i.cutInYears.length === 2)).toBe(true)
    })
  })

  describe('§6 Paare', () => {
    it('compares the joint Bescheid of 2024 with two single returns and says it is approximate (contract)', async () => {
      const { couples } = await setup().service.get(USER, TODAY)
      expect(couples).toHaveLength(1)
      expect(couples[0]).toMatchObject({ year: 2024, status: 'gerechnet', filedAs: 'zusammen', approximate: true })
    })
  })

  describe('§7 Gruppen', () => {
    it('has no group without data, and the loss pots are not recorded', async () => {
      const { groups } = await setup().service.get(USER, TODAY)
      expect(groups).toEqual({ crossBorder: null, rental: null, capital: null, pension: null, lossCarryForward: { status: 'notRecorded' } })
    })

    it('follows a rental object across the years by its key', async () => {
      const { service, rental } = setup()
      rental.seed({ id: 'r24', propertyKey: 'whg', userId: USER, taxYear: 2024, mieteinnahmen: '9600', anschaffungskosten: '210000', baujahr: '1995', werbungskosten: '2400', anschaffungsdatum: '2023-04-01' })
      rental.seed({ id: 'r25', propertyKey: 'whg', userId: USER, taxYear: 2025, mieteinnahmen: '9600', anschaffungskosten: '210000', baujahr: '1995', werbungskosten: '2400', anschaffungsdatum: '2023-04-01', erhaltungsaufwand: '[{"betrag":4300,"datum":"2025-05-02"}]' })
      const { groups, events } = await service.get(USER, TODAY)
      expect(groups.rental!.properties).toHaveLength(1)
      expect(groups.rental!.properties[0]!.years.map((y) => [y.year, y.depreciation])).toEqual([
        [2024, 4_200],
        [2025, 4_200],
      ])
      expect(groups.rental!.properties[0]!.acquisitionRelated).toMatchObject({ withinWindowEur: 4_300, windowEnd: '2026-04-01', windowOpen: false })
      // The purchase date alone puts the marker on 2023, once, though the object has two years.
      expect(events.filter((e) => e.kind === 'immobilienkauf')).toEqual([{ year: 2023, kind: 'immobilienkauf', person: null, date: '2023-04-01', count: 1 }])
    })
  })

  describe('§9 Unterlagen', () => {
    it('lists the uploaded Bescheide, the duration and the Einspruch history per year', async () => {
      const { service, receipts, assessments } = setup()
      receipts.seed({ id: 'b-2024', userId: USER, fileName: 'Bescheid-2024.pdf', kind: 'Steuerbescheid', taxYear: 2024, proposalDismissed: false, createdAt: new Date('2026-11-03T09:00:00Z'), updatedAt: new Date('2026-11-03T09:00:00Z') })
      const current = (await assessments.findForUserAndYear(USER, 2024))!
      assessments.seed({ ...current, status: 'einspruch-eingelegt', appealReason: 'betrag-falsch', appealDate: '2026-11-10', appealOutcome: 'teilweise', appealOutcomeAmount: '140' })
      const dto = toYearHistoryDto(await service.get(USER, TODAY))
      const y2024 = dto.documents.find((d) => d.year === 2024)!
      expect(y2024.documents).toEqual([{ receiptId: 'b-2024', fileName: 'Bescheid-2024.pdf', uploadedAt: '2026-11-03T09:00:00.000Z', downloadPath: '/v1/belege/b-2024/datei' }])
      expect(y2024.wait).toEqual({ days: 42, weeks: 6, pending: false, askTaxOffice: false })
      expect(y2024.appeals).toEqual([{ person: null, date: '2026-11-10', reason: 'betrag-falsch', outcome: 'teilweise', amount: 140 }])
      expect(dto.documents.find((d) => d.year === 2025)!.wait).toMatchObject({ pending: true, askTaxOffice: false })
    })
  })
})
