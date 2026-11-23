import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  appealDeadline,
  assessmentLessons,
  buildYearHistory,
  filedElsewhereState,
  openAssessmentPeriodYears,
  yearDeadline,
  declaredPersonPositions,
  diffAssessment,
  todayIso,
  type AppealDeadline,
  type AssessmentDiff,
  type AssessmentLesson,
  type AssessmentPositionId,
  type AssessmentPositionValues,
  type EstimateFacts,
  type FiledElsewhereAnswer,
  type FiledElsewhereState,
  type FilingYearFacts,
  type NextYearDeclaration,
  type PersonYearFacts,
  type TaxYearStatus,
  type WorkExpenseParts,
  type YearHistoryEntry,
  type YearDeadline,
  type YearHistoryInput,
} from '@steuereule/core'
import { assessedValuesOf, filedReturnOf, hasAssessedValues, assessedReturnOf } from '../assessment/assessment-positions.js'
import { ASSESSMENT_REPOSITORY, type AssessmentRecord, type AssessmentRepository } from '../assessment/assessment.repository.js'
import { FILING_VERSION_REPOSITORY, type FilingVersionRecord, type FilingVersionRepository } from '../assessment/filing-version.repository.js'
import { AuditService } from '../audit/audit.service.js'
import type { CrossBorderSalaryStatementRecord } from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import { ConflictError, InvalidInputError } from '../common/domain-error.js'
import { answersFrom } from '../interview/answers.js'
import { recordedSpouseUserId } from '../link/link.service.js'
import type { WageTaxCertificateRecord } from '../lstb/lstb.repository.js'
import { TAX_CASE_READER, type TaxCaseReader } from '../tax-case/tax-case.reader.js'
import { TaxEstimateService } from '../tax-estimate/tax-estimate.service.js'
import { todaysWorkExpenses, wageFacts } from './person-facts.js'
import { YearHistoryInsightsService, type YearHistoryInsights } from './year-history-insights.service.js'
import { YEAR_HISTORY_REPOSITORY, type HistoryYearRecord, type YearHistoryRepository } from './year-history.repository.js'

/** How a year stands in the list (ADR-0098 §1). */
export type YearKind = 'eckjahr' | 'bescheid' | 'eingereicht' | 'offen'

/** One filing of a year as the API gathered it: whose, its Bescheid and its frozen version. */
export interface GatheredFiling {
  readonly person: 'A' | 'B' | null
  readonly assessment: AssessmentRecord | null
  readonly version: FilingVersionRecord | null
  readonly facts: FilingYearFacts
}

/** A person's raw records of the year, decrypted once and shared with the insights (ADR-0099). */
export interface GatheredPerson {
  readonly dataUserId: string
  readonly lstb: WageTaxCertificateRecord | null
  readonly ch: CrossBorderSalaryStatementRecord | null
}

export interface GatheredYear {
  readonly year: number
  readonly status: TaxYearStatus | null
  readonly kind: YearKind
  /** The year has facts of its own; a gap year of the Festsetzungsfrist has none (ADR-0099 §1). */
  readonly hasData: boolean
  readonly filedElsewhere: HistoryYearRecord['filedElsewhere']
  /** Person A's interview answers of the year. */
  readonly answers: Readonly<Record<string, string>>
  readonly persons: { readonly A: GatheredPerson; readonly B: GatheredPerson | null }
  readonly input: YearHistoryInput
  readonly filings: readonly GatheredFiling[]
  /** What the year declares today (frozen version, else today's answers), for the lessons of the year before. */
  readonly declaration: NextYearDeclaration
}

export interface YearDiff {
  readonly year: number
  readonly person: 'A' | 'B' | null
  readonly submittedOn: string
  readonly assessmentDate: string | null
  readonly deadline: AppealDeadline | null
  readonly diff: AssessmentDiff
  readonly lessons: readonly AssessmentLesson[]
}

export interface YearListItem {
  readonly year: number
  readonly status: TaxYearStatus | null
  readonly kind: YearKind
  readonly filingType: 'einzel' | 'zusammen'
  readonly declaredRefund: number | null
  readonly assessedRefund: number | null
  readonly difference: number | null
  readonly deviations: number
  /** Why the year has no Bescheid-Abgleich; null when it has one. */
  readonly noDiffReason: 'eckjahr' | 'kein-bescheid' | 'keine-eingereichte-fassung' | null
  /** Within the four years a return can still be filed or changed (Festsetzungsfrist, ADR-0049 M3); older years are shown only. */
  readonly withinAssessmentPeriod: boolean
  /** The year has facts of its own; without them it shows no amount (ADR-0099 §1). */
  readonly hasData: boolean
  /** „Schon abgegeben?“ for a year of the Festsetzungsfrist without data; null for every other year. */
  readonly filedElsewhere: FiledElsewhereState | null
  /** Filed elsewhere or known from outside, but no Bescheid uploaded yet („noch ohne Bescheid“). */
  readonly withoutAssessment: boolean
  /** Until when a return can be filed, or the Bescheid changed (ADR-0099 §1). */
  readonly deadline: YearDeadline
}

export type OpenItem =
  | {
      readonly kind: 'einspruchsfrist'
      readonly year: number
      readonly highlighted: true
      readonly refundDifference: number | null
      readonly deviations: number
      readonly deadline: AppealDeadline
    }
  | {
      readonly kind: 'wartet-auf-bescheid'
      readonly year: number
      readonly highlighted: false
      /** Positions the year before's Bescheid cut and this year declares the same way again; no amount (§ 7). */
      readonly repeatedCuts: ReadonlyArray<{ readonly position: AssessmentPositionId; readonly label: string }>
    }
  | {
      readonly kind: 'offen'
      readonly year: number
      readonly highlighted: false
      readonly missing: readonly string[]
      /** A year before the current one: the last day of a voluntary return (ADR-0099 §1). */
      readonly filingDeadline: string | null
      /** The year has no data yet and asks „Schon abgegeben?“. */
      readonly askFiledElsewhere: boolean
    }

export interface MaskLessons {
  /** The open year whose masks show the lessons. */
  readonly year: number
  /** The Bescheid they come from. */
  readonly fromYear: number
  readonly lessons: readonly AssessmentLesson[]
}

export interface YearHistory extends YearHistoryInsights {
  readonly today: string
  readonly years: readonly YearHistoryEntry[]
  readonly list: readonly YearListItem[]
  readonly openItems: readonly OpenItem[]
  readonly diffs: readonly YearDiff[]
  readonly maskLessons: MaskLessons | null
}

/** What answering „Schon abgegeben?“ left the year as. */
export interface FiledElsewhereResult {
  readonly year: number
  readonly status: TaxYearStatus
  readonly filedElsewhere: FiledElsewhereState
  readonly deadline: YearDeadline
}

const SUBMITTED: ReadonlySet<TaxYearStatus> = new Set(['eingereicht', 'rueckfrage', 'bescheid', 'abgeschlossen'])
const FESTSETZUNGSFRIST_YEARS = 4
const NO_PERSON = (dataUserId: string): GatheredPerson => ({ dataUserId, lstb: null, ch: null })

/** Positions of person `from` keyed as person A: a single return's Bescheid has one column. */
function asPersonA(values: AssessmentPositionValues, from: 'A' | 'B'): AssessmentPositionValues {
  if (from === 'A') return values
  const out: Record<string, number> = {}
  for (const [id, v] of Object.entries(values)) if (id.endsWith('B')) out[`${id.slice(0, -1)}A`] = v
  return out as AssessmentPositionValues
}

const partsFromPositions = (p: AssessmentPositionValues, person: 'A' | 'B'): WorkExpenseParts | null => {
  const get = (id: string) => p[`${id}${person}` as AssessmentPositionId]
  const parts = [get('fahrtweg'), get('homeoffice'), get('arbeitsmittel'), get('sonstigeWerbungskosten')]
  if (parts.every((v) => v === undefined)) return null
  return { fahrtweg: parts[0] ?? 0, homeoffice: parts[1] ?? 0, arbeitsmittel: parts[2] ?? 0, sonstiges: parts[3] ?? 0 }
}

/**
 * `GET /v1/verlauf` (ADR-0098 §5): decrypts what the account keeps for every year, lets the core build
 * the Verlauf, the Bescheid-Abgleich and its lessons, and returns them. Nothing is stored or cached, and
 * nothing is read across accounts: Person B appears only where this user keeps B's figures (ADR-0054).
 */
@Injectable()
export class YearHistoryService {
  constructor(
    @Inject(YEAR_HISTORY_REPOSITORY) private readonly years: YearHistoryRepository,
    @Inject(ASSESSMENT_REPOSITORY) private readonly assessments: AssessmentRepository,
    @Inject(FILING_VERSION_REPOSITORY) private readonly filingVersions: FilingVersionRepository,
    @Inject(TAX_CASE_READER) private readonly cases: TaxCaseReader,
    @Inject(TaxEstimateService) private readonly estimates: TaxEstimateService,
    @Inject(YearHistoryInsightsService) private readonly insights: YearHistoryInsightsService,
    @Optional() @Inject(AuditService) private readonly audit?: AuditService,
  ) {}

  /** The years with data plus the years of the Festsetzungsfrist without any (ADR-0099 §1), oldest first. */
  private async recordsOf(userId: string, today: string): Promise<HistoryYearRecord[]> {
    const records = await this.years.yearsOf(userId)
    const known = new Set(records.map((r) => r.year))
    const gaps = openAssessmentPeriodYears(today)
      .filter((year) => !known.has(year))
      .map((year): HistoryYearRecord => ({ year, status: null, hasData: false, filedElsewhere: null }))
    return [...records, ...gaps].sort((a, b) => a.year - b.year)
  }

  async get(userId: string, today: string = todayIso()): Promise<YearHistory> {
    const records = await this.recordsOf(userId, today)
    const gathered = await Promise.all(records.map((r) => this.gather(userId, r)))
    await this.audit?.append({ userId, action: 'READ', resource: 'verlauf' })

    const byYear = new Map(gathered.map((g) => [g.year, g]))
    const history = buildYearHistory(gathered.map((g) => g.input))
    const diffs = gathered.flatMap((g) => this.diffsOf(g, byYear.get(g.year + 1) ?? null, today))
    const currentYear = Number(today.slice(0, 4))
    const periodYears = new Set(openAssessmentPeriodYears(today))
    const list = gathered.map((g): YearListItem => {
      const entry = history.find((e) => e.year === g.year)!
      const own = diffs.filter((d) => d.year === g.year)
      const assessed = g.filings.some((f) => hasAssessedValues(f.assessment))
      return {
        year: g.year,
        status: g.status,
        kind: g.kind,
        filingType: g.input.filingType,
        declaredRefund: entry.erstattung.declared,
        assessedRefund: entry.erstattung.amount.tier === 'bescheid' && g.kind !== 'offen' && g.filings.every((f) => hasAssessedValues(f.assessment)) ? entry.erstattung.amount.value : null,
        difference: entry.erstattung.difference,
        deviations: own.reduce((n, d) => n + d.diff.counts.deviations, 0),
        noDiffReason: own.length > 0 ? null : g.kind === 'eckjahr' ? 'eckjahr' : g.kind === 'bescheid' ? 'keine-eingereichte-fassung' : 'kein-bescheid',
        withinAssessmentPeriod: g.year >= currentYear - FESTSETZUNGSFRIST_YEARS,
        hasData: g.hasData,
        filedElsewhere: !g.hasData && periodYears.has(g.year) ? filedElsewhereState(g.year, g.filedElsewhere, today) : null,
        withoutAssessment: g.kind === 'eckjahr' && !assessed,
        deadline: yearDeadline({ year: g.year, assessed, filedOn: g.filings.find((f) => f.version !== null)?.version?.submittedOn ?? null }, today),
      }
    })
    const insights = await this.insights.build(userId, { today, years: gathered, diffs, list })
    return { today, years: history, list, openItems: openItems(gathered, diffs, list, today), diffs, maskLessons: maskLessons(gathered, diffs), ...insights }
  }

  /**
   * „Schon abgegeben?“ (ADR-0099 §1), once per year of the Festsetzungsfrist that has no data. „Ja“ makes
   * the year `extern-erledigt`, waiting for its Bescheid; „Nein“ and „Weiß nicht“ leave it an open draft.
   * The year was never declared in the app, so taking the answer back is no illegal ADR-0039 transition.
   */
  async answerFiledElsewhere(userId: string, year: number, answer: FiledElsewhereAnswer, today: string = todayIso()): Promise<FiledElsewhereResult> {
    if (!openAssessmentPeriodYears(today).includes(year)) {
      throw new InvalidInputError('JAHR_AUSSERHALB_FRIST', `${year} is not one of the years a return can still be filed for.`)
    }
    const record = (await this.years.yearsOf(userId)).find((r) => r.year === year)
    if (record?.hasData === true) {
      throw new ConflictError('JAHR_HAT_DATEN', `${year} already has data in the app; the question is only for years without.`)
    }
    const status: TaxYearStatus = answer === 'ja' ? 'extern-erledigt' : 'entwurf'
    await this.years.setFiledElsewhere(userId, year, answer, today, status)
    return {
      year,
      status,
      filedElsewhere: filedElsewhereState(year, { answer, answeredOn: today }, today),
      deadline: yearDeadline({ year, assessed: false, filedOn: null }, today),
    }
  }

  /** One Abgleich per filing with a Bescheid and a version filed in the app (§ 8: two single returns, two). */
  private diffsOf(g: GatheredYear, next: GatheredYear | null, today: string): YearDiff[] {
    return g.filings.flatMap((f) => {
      if (f.version === null || !hasAssessedValues(f.assessment)) return []
      const diff = diffAssessment(filedReturnOf(f.version), assessedReturnOf(f.assessment))
      // In a single return of B the Bescheid's one column is B's; the next year is read the same way.
      const nextDeclaration = next === null ? null : { ...next.declaration, positions: f.person === 'B' ? asPersonA(next.declaration.positions, 'B') : next.declaration.positions }
      const date = f.assessment?.assessmentDate ?? null
      return [
        {
          year: g.year,
          person: f.person,
          submittedOn: f.version.submittedOn,
          assessmentDate: date,
          deadline: date === null ? null : appealDeadline(date, today),
          diff,
          lessons: assessmentLessons(diff, nextDeclaration),
        },
      ]
    })
  }

  private async gather(userId: string, record: HistoryYearRecord): Promise<GatheredYear> {
    const { year, status, hasData } = record
    const { coupling: link } = await this.cases.read(userId, year, ['coupling'])
    const filingType: 'einzel' | 'zusammen' = link?.filingType === 'zusammen' ? 'zusammen' : 'einzel'
    const spouseUserId = recordedSpouseUserId(link, userId)
    const [assessmentA, versionA, assessmentB, versionB] = await Promise.all([
      this.assessments.findForUserAndYear(userId, year),
      this.filingVersions.findLatest(userId, year),
      spouseUserId && filingType === 'einzel' ? this.assessments.findForUserAndYear(spouseUserId, year) : Promise.resolve(null),
      spouseUserId && filingType === 'einzel' ? this.filingVersions.findLatest(spouseUserId, year) : Promise.resolve(null),
    ])
    const [recordsA, recordsB, answerRows] = await Promise.all([
      this.personRecords(userId, year),
      spouseUserId ? this.personRecords(spouseUserId, year) : Promise.resolve(null),
      this.cases.read(userId, year, ['interviewRows']).then((c) => c.interviewRows),
    ])
    const [personA, personB] = await Promise.all([
      this.personFacts(recordsA, year, versionA, 'A'),
      recordsB ? this.personFacts(recordsB, year, filingType === 'zusammen' ? versionA : versionB, filingType === 'zusammen' ? 'B' : 'A') : Promise.resolve(null),
    ])

    // B's own single return, kept by this user, counts only where B has something for the year.
    const includesB = spouseUserId !== null && (filingType === 'zusammen' || assessmentB !== null || versionB !== null || personB?.wage != null)
    const filings: GatheredFiling[] = []
    const missing: string[] = []
    const filing = async (person: 'A' | 'B' | null, estimateUser: string, assessment: AssessmentRecord | null, version: FilingVersionRecord | null, prefix: string) => {
      const assessed = hasAssessedValues(assessment)
      // A year without facts of its own gets no amount, not even an estimate (ADR-0099 §1).
      const estimate = assessed || !hasData ? null : await this.estimate(estimateUser, year)
      if (estimate !== null && 'missing' in estimate) missing.push(...estimate.missing.map((m) => `${prefix}${m}`))
      filings.push({
        person,
        assessment,
        version,
        facts: {
          person,
          estimate: estimate !== null && 'result' in estimate ? estimate : null,
          assessment: assessed ? assessedValuesOf(assessment) : null,
          declaredRefund: version?.positions.erstattung ?? null,
          estimateAtSubmission: version?.estimateAtSubmission ?? null,
        },
      })
    }
    if (filingType === 'zusammen') {
      await filing(null, userId, assessmentA, versionA, '')
    } else {
      await filing('A', userId, assessmentA, versionA, '')
      if (includesB) await filing('B', spouseUserId!, assessmentB, versionB, 'personB.')
    }

    const eckjahr = status === 'extern-erledigt'
    const assessedAll = filings.length > 0 && filings.every((f) => hasAssessedValues(f.assessment))
    const filed = filings.some((f) => f.version !== null) || (status !== null && SUBMITTED.has(status))
    const kind: YearKind = eckjahr ? 'eckjahr' : assessedAll ? 'bescheid' : filed ? 'eingereicht' : 'offen'
    const input: YearHistoryInput = {
      year,
      filingType,
      eckjahr,
      people: { A: personA, B: includesB ? personB : null },
      filings: filings.map((f) => f.facts),
      missing: [...new Set(missing)],
    }
    return {
      year,
      status,
      kind,
      hasData,
      filedElsewhere: record.filedElsewhere,
      answers: answersFrom(answerRows),
      persons: { A: recordsA, B: includesB ? (recordsB ?? NO_PERSON(spouseUserId!)) : null },
      input,
      filings,
      declaration: declarationOf(year, versionA, personA, includesB ? personB : null),
    }
  }

  private async personRecords(dataUserId: string, year: number): Promise<GatheredPerson> {
    const { wageTaxCertificate: lstb, salaryStatement: ch } = await this.cases.read(dataUserId, year, ['wageTaxCertificate', 'salaryStatement'])
    return { dataUserId, lstb, ch }
  }

  /** The Cockpit's estimate of the year (ADR-0094): a range, or what it still needs. */
  private async estimate(userId: string, year: number): Promise<EstimateFacts | { missing: readonly string[] }> {
    try {
      const state = await this.estimates.getState(userId, year)
      if (state.kind === 'spanne') return { result: state.result, incomeTax: state.incomeTax, taxableIncome: state.taxableIncome }
      return { missing: state.kind === 'offen' ? state.missing : [state.reason] }
    } catch {
      // A year the core keeps no tariff for (an old Eckjahr) has no estimate, which is no error.
      return { missing: ['jahr-ohne-tarif'] }
    }
  }

  /** A person's wage facts and what the declaration claims as Werbungskosten. */
  private async personFacts(records: GatheredPerson, year: number, version: FilingVersionRecord | null, column: 'A' | 'B'): Promise<PersonYearFacts> {
    const frozen = version === null ? null : partsFromPositions(version.positions, column)
    const declaredWorkExpenses = frozen ?? (version === null ? await this.todaysWorkExpenses(records.dataUserId, year) : null)
    return { wage: wageFacts(records.lstb, records.ch), declaredWorkExpenses }
  }

  private async todaysWorkExpenses(dataUserId: string, year: number): Promise<WorkExpenseParts | null> {
    const { commute: path, interviewRows: rows } = await this.cases.read(dataUserId, year, ['commute', 'interviewRows'])
    return todaysWorkExpenses(year, path, rows)
  }
}

/** What a year declares for the lessons of the year before: its frozen version, else today's figures. */
function declarationOf(year: number, version: FilingVersionRecord | null, a: PersonYearFacts, b: PersonYearFacts | null): NextYearDeclaration {
  if (version !== null) return { year, source: 'filed', positions: version.positions }
  // The same shaping the Abgabe freezes, so a lesson reads today's answers as they would be filed.
  return { year, source: 'answers', positions: { ...declaredPersonPositions('A', a), ...(b ? declaredPersonPositions('B', b) : {}) } }
}

/**
 * „Was ansteht“ (ADR-0098 §1): at most one item per year, the running Einspruchsfrist first. A year without
 * data (ADR-0099 §1) is open while it asks „Schon abgegeben?“ or was answered „Nein“; „Ja“ waits for the
 * Bescheid upload and „Weiß nicht“ stays quiet until it asks again.
 */
function openItems(years: readonly GatheredYear[], diffs: readonly YearDiff[], list: readonly YearListItem[], today: string): OpenItem[] {
  const items: OpenItem[] = []
  const currentYear = Number(today.slice(0, 4))
  for (const g of years) {
    const listItem = list.find((l) => l.year === g.year)!
    const question = listItem.filedElsewhere
    if (question !== null && !question.ask && question.answer !== 'nein') continue
    const own = diffs.filter((d) => d.year === g.year && d.diff.counts.deviations > 0 && d.deadline?.running === true)
    if (own.length > 0) {
      const first = [...own].sort((x, y) => x.deadline!.remainingDays - y.deadline!.remainingDays)[0]!
      items.push({
        kind: 'einspruchsfrist',
        year: g.year,
        highlighted: true,
        refundDifference: list.find((l) => l.year === g.year)?.difference ?? null,
        deviations: own.reduce((n, d) => n + d.diff.counts.deviations, 0),
        deadline: first.deadline!,
      })
    } else if (g.kind === 'eingereicht') {
      const cuts = diffs.filter((d) => d.year === g.year - 1).flatMap((d) => d.lessons.filter((l) => l.nextYear?.declaredAboveRecognised === true))
      items.push({ kind: 'wartet-auf-bescheid', year: g.year, highlighted: false, repeatedCuts: cuts.map((l) => ({ position: l.position, label: l.label })) })
    } else if (g.kind === 'offen') {
      const filingDeadline = g.year < currentYear && listItem.deadline.running ? listItem.deadline.endsOn : null
      items.push({
        kind: 'offen',
        year: g.year,
        highlighted: false,
        missing: g.input.missing.length > 0 ? g.input.missing : ['erklaerung'],
        filingDeadline,
        askFiledElsewhere: question?.ask ?? false,
      })
    }
  }
  // The highlighted deadline first, then the years in order, as in the mock.
  return items.sort((x, y) => Number(y.highlighted) - Number(x.highlighted) || x.year - y.year)
}

/** The lessons of the latest Bescheid before the latest open year, for that year's masks (ADR-0098 §8). */
function maskLessons(years: readonly GatheredYear[], diffs: readonly YearDiff[]): MaskLessons | null {
  const openYear = years.filter((g) => g.kind === 'offen').at(-1)
  if (!openYear) return null
  const source = diffs.filter((d) => d.year < openYear.year && d.lessons.some((l) => l.mask !== null)).at(-1)
  if (!source) return null
  return { year: openYear.year, fromYear: source.year, lessons: source.lessons.filter((l) => l.mask !== null) }
}
