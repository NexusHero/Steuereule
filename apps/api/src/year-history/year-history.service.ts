import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  appealDeadline,
  assessmentLessons,
  buildYearHistory,
  declaredPersonPositions,
  diffAssessment,
  todayIso,
  type AppealDeadline,
  type AssessmentDiff,
  type AssessmentLesson,
  type AssessmentPositionId,
  type AssessmentPositionValues,
  type EstimateFacts,
  type FilingYearFacts,
  type NextYearDeclaration,
  type PersonYearFacts,
  type TaxYearStatus,
  type WorkExpenseParts,
  type YearHistoryEntry,
  type YearHistoryInput,
} from '@steuereule/core'
import { assessedValuesOf, filedReturnOf, hasAssessedValues, assessedReturnOf } from '../assessment/assessment-positions.js'
import { ASSESSMENT_REPOSITORY, type AssessmentRecord, type AssessmentRepository } from '../assessment/assessment.repository.js'
import { FILING_VERSION_REPOSITORY, type FilingVersionRecord, type FilingVersionRepository } from '../assessment/filing-version.repository.js'
import { AuditService } from '../audit/audit.service.js'
import { CROSS_BORDER_SALARY_STATEMENT_REPOSITORY, type CrossBorderSalaryStatementRepository } from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import { COMMUTE_REPOSITORY, type CommuteRepository } from '../commute/commute.repository.js'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { PARTNER_COUPLING_REPOSITORY, type PartnerCouplingRepository } from '../link/link.repository.js'
import { recordedSpouseUserId } from '../link/link.service.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { TaxEstimateService } from '../tax-estimate/tax-estimate.service.js'
import { todaysWorkExpenses, wageFacts } from './person-facts.js'
import { YEAR_HISTORY_REPOSITORY, type YearHistoryRepository } from './year-history.repository.js'

/** How a year stands in the list (ADR-0098 §1). */
export type YearKind = 'eckjahr' | 'bescheid' | 'eingereicht' | 'offen'

/** One filing of a year as the API gathered it: whose, its Bescheid and its frozen version. */
interface GatheredFiling {
  readonly person: 'A' | 'B' | null
  readonly assessment: AssessmentRecord | null
  readonly version: FilingVersionRecord | null
  readonly facts: FilingYearFacts
}

interface GatheredYear {
  readonly year: number
  readonly status: TaxYearStatus | null
  readonly kind: YearKind
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
  | { readonly kind: 'offen'; readonly year: number; readonly highlighted: false; readonly missing: readonly string[] }

export interface MaskLessons {
  /** The open year whose masks show the lessons. */
  readonly year: number
  /** The Bescheid they come from. */
  readonly fromYear: number
  readonly lessons: readonly AssessmentLesson[]
}

export interface YearHistory {
  readonly today: string
  readonly years: readonly YearHistoryEntry[]
  readonly list: readonly YearListItem[]
  readonly openItems: readonly OpenItem[]
  readonly diffs: readonly YearDiff[]
  readonly maskLessons: MaskLessons | null
}

const SUBMITTED: ReadonlySet<TaxYearStatus> = new Set(['eingereicht', 'rueckfrage', 'bescheid', 'abgeschlossen'])
const FESTSETZUNGSFRIST_YEARS = 4

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
    @Inject(WAGE_TAX_CERTIFICATE_REPOSITORY) private readonly lstb: WageTaxCertificateRepository,
    @Inject(CROSS_BORDER_SALARY_STATEMENT_REPOSITORY) private readonly ch: CrossBorderSalaryStatementRepository,
    @Inject(COMMUTE_REPOSITORY) private readonly commute: CommuteRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interview: InterviewAnswerRepository,
    @Inject(PARTNER_COUPLING_REPOSITORY) private readonly link: PartnerCouplingRepository,
    @Inject(TaxEstimateService) private readonly estimates: TaxEstimateService,
    @Optional() @Inject(AuditService) private readonly audit?: AuditService,
  ) {}

  async get(userId: string, today: string = todayIso()): Promise<YearHistory> {
    const records = await this.years.yearsOf(userId)
    const gathered = await Promise.all(records.map((r) => this.gather(userId, r.year, r.status)))
    await this.audit?.append({ userId, action: 'READ', resource: 'verlauf' })

    const byYear = new Map(gathered.map((g) => [g.year, g]))
    const history = buildYearHistory(gathered.map((g) => g.input))
    const diffs = gathered.flatMap((g) => this.diffsOf(g, byYear.get(g.year + 1) ?? null, today))
    const currentYear = Number(today.slice(0, 4))
    const list = gathered.map((g): YearListItem => {
      const entry = history.find((e) => e.year === g.year)!
      const own = diffs.filter((d) => d.year === g.year)
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
      }
    })
    return { today, years: history, list, openItems: openItems(gathered, diffs, list), diffs, maskLessons: maskLessons(gathered, diffs) }
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

  private async gather(userId: string, year: number, status: TaxYearStatus | null): Promise<GatheredYear> {
    const link = await this.link.findByUserAndYear(userId, year)
    const filingType: 'einzel' | 'zusammen' = link?.filingType === 'zusammen' ? 'zusammen' : 'einzel'
    const spouseUserId = recordedSpouseUserId(link, userId)
    const [assessmentA, versionA, assessmentB, versionB] = await Promise.all([
      this.assessments.findForUserAndYear(userId, year),
      this.filingVersions.findLatest(userId, year),
      spouseUserId && filingType === 'einzel' ? this.assessments.findForUserAndYear(spouseUserId, year) : Promise.resolve(null),
      spouseUserId && filingType === 'einzel' ? this.filingVersions.findLatest(spouseUserId, year) : Promise.resolve(null),
    ])
    const [personA, personB] = await Promise.all([
      this.personFacts(userId, year, versionA, 'A'),
      spouseUserId ? this.personFacts(spouseUserId, year, filingType === 'zusammen' ? versionA : versionB, filingType === 'zusammen' ? 'B' : 'A') : Promise.resolve(null),
    ])

    // B's own single return, kept by this user, counts only where B has something for the year.
    const includesB = spouseUserId !== null && (filingType === 'zusammen' || assessmentB !== null || versionB !== null || personB?.wage != null)
    const filings: GatheredFiling[] = []
    const missing: string[] = []
    const filing = async (person: 'A' | 'B' | null, estimateUser: string, assessment: AssessmentRecord | null, version: FilingVersionRecord | null, prefix: string) => {
      const assessed = hasAssessedValues(assessment)
      const estimate = assessed ? null : await this.estimate(estimateUser, year)
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
    return { year, status, kind, input, filings, declaration: declarationOf(year, versionA, personA, includesB ? personB : null) }
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
  private async personFacts(dataUserId: string, year: number, version: FilingVersionRecord | null, column: 'A' | 'B'): Promise<PersonYearFacts> {
    const [lstbRecord, chRecord] = await Promise.all([this.lstb.findForUserAndYear(dataUserId, year), this.ch.findForUserAndYear(dataUserId, year)])
    const frozen = version === null ? null : partsFromPositions(version.positions, column)
    const declaredWorkExpenses = frozen ?? (version === null ? await this.todaysWorkExpenses(dataUserId, year) : null)
    return { wage: wageFacts(lstbRecord, chRecord), declaredWorkExpenses }
  }

  private async todaysWorkExpenses(dataUserId: string, year: number): Promise<WorkExpenseParts | null> {
    const [path, rows] = await Promise.all([this.commute.findForUserAndYear(dataUserId, year), this.interview.findAllForUserAndYear(dataUserId, year)])
    return todaysWorkExpenses(year, path, rows)
  }
}

/** What a year declares for the lessons of the year before: its frozen version, else today's figures. */
function declarationOf(year: number, version: FilingVersionRecord | null, a: PersonYearFacts, b: PersonYearFacts | null): NextYearDeclaration {
  if (version !== null) return { year, source: 'filed', positions: version.positions }
  // The same shaping the Abgabe freezes, so a lesson reads today's answers as they would be filed.
  return { year, source: 'answers', positions: { ...declaredPersonPositions('A', a), ...(b ? declaredPersonPositions('B', b) : {}) } }
}

/** „Was ansteht“ (ADR-0098 §1): at most one item per year, the running Einspruchsfrist first. */
function openItems(years: readonly GatheredYear[], diffs: readonly YearDiff[], list: readonly YearListItem[]): OpenItem[] {
  const items: OpenItem[] = []
  for (const g of years) {
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
      items.push({ kind: 'offen', year: g.year, highlighted: false, missing: g.input.missing.length > 0 ? g.input.missing : ['erklaerung'] })
    }
  }
  return items.sort((x, y) => Number(y.highlighted) - Number(x.highlighted) || y.year - x.year)
}

/** The lessons of the latest Bescheid before the latest open year, for that year's masks (ADR-0098 §8). */
function maskLessons(years: readonly GatheredYear[], diffs: readonly YearDiff[]): MaskLessons | null {
  const openYear = years.filter((g) => g.kind === 'offen').at(-1)
  if (!openYear) return null
  const source = diffs.filter((d) => d.year < openYear.year && d.lessons.some((l) => l.mask !== null)).at(-1)
  if (!source) return null
  return { year: openYear.year, fromYear: source.year, lessons: source.lessons.filter((l) => l.mask !== null) }
}
