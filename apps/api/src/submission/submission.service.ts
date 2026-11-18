import { Inject, Injectable } from '@nestjs/common'
import {
  canRecordSubmission,
  canWithdrawSubmission,
  filedPositions,
  submissionDateProblem,
  todayIso,
  type AssessmentPositionValues,
  type PersonYearFacts,
  type Range,
  type SubmissionEstimate,
  type TaxYearStatus,
} from '@steuereule/core'
import { hasAssessedValues } from '../assessment/assessment-positions.js'
import { ASSESSMENT_REPOSITORY, type AssessmentRepository } from '../assessment/assessment.repository.js'
import { FILING_VERSION_REPOSITORY, type FilingVersionRepository } from '../assessment/filing-version.repository.js'
import { CROSS_BORDER_SALARY_STATEMENT_REPOSITORY, type CrossBorderSalaryStatementRepository } from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import { COMMUTE_REPOSITORY, type CommuteRepository } from '../commute/commute.repository.js'
import { ConflictError, InvalidInputError, NotFoundError } from '../common/domain-error.js'
import { INTERVIEW_ANSWER_REPOSITORY, type InterviewAnswerRepository } from '../interview/interview-answer.repository.js'
import { PARTNER_COUPLING_REPOSITORY, type PartnerCouplingRepository } from '../link/link.repository.js'
import { recordedSpouseUserId } from '../link/link.service.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { TaxEstimateService } from '../tax-estimate/tax-estimate.service.js'
import { todaysWorkExpenses, wageFacts } from '../year-history/person-facts.js'
import { SUBMISSION_REPOSITORY, type SubmissionRepository } from './submission.repository.js'

export interface SubmissionResult {
  readonly status: 'eingereicht'
  readonly submittedOn: string
  readonly replacedPrevious: boolean
}

/** What the cockpit shows of the Abgabe. */
export interface SubmissionState {
  readonly status: TaxYearStatus
  readonly submittedOn: string
  /** Undoable until a Bescheid is recorded. */
  readonly withdrawable: boolean
}

/**
 * The Abgabe (ADR-0098 §8). The app does not file: the user files the printed forms himself and then
 * tells the app the day he did. That freezes the return as it stands into a `FilingVersion`, the left
 * side of the later Bescheid-Abgleich, and the year becomes `eingereicht` („wartet auf Bescheid“).
 */
@Injectable()
export class SubmissionService {
  constructor(
    @Inject(SUBMISSION_REPOSITORY) private readonly submissions: SubmissionRepository,
    @Inject(FILING_VERSION_REPOSITORY) private readonly versions: FilingVersionRepository,
    @Inject(ASSESSMENT_REPOSITORY) private readonly assessments: AssessmentRepository,
    @Inject(WAGE_TAX_CERTIFICATE_REPOSITORY) private readonly lstb: WageTaxCertificateRepository,
    @Inject(CROSS_BORDER_SALARY_STATEMENT_REPOSITORY) private readonly ch: CrossBorderSalaryStatementRepository,
    @Inject(COMMUTE_REPOSITORY) private readonly commute: CommuteRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interview: InterviewAnswerRepository,
    @Inject(PARTNER_COUPLING_REPOSITORY) private readonly link: PartnerCouplingRepository,
    @Inject(TaxEstimateService) private readonly estimates: TaxEstimateService,
  ) {}

  async submit(userId: string, taxYear: number, dto: { submittedOn: string }, today: string = todayIso()): Promise<SubmissionResult> {
    const problem = submissionDateProblem(dto.submittedOn, taxYear, today)
    if (problem !== null) {
      throw new InvalidInputError('SUBMISSION_DATE_INVALID', `submittedOn is not a valid submission date (${problem}).`, { problem })
    }
    const status = await this.submissions.yearStatus(userId, taxYear)
    if (status === null) throw new NotFoundError('TAX_YEAR_NOT_FOUND', `There is no tax year ${taxYear} to submit.`)
    if (!canRecordSubmission(status)) {
      throw new ConflictError('SUBMISSION_NOT_ALLOWED', `A tax year in state "${status}" cannot be submitted.`, { status })
    }
    // A corrected return after the Bescheid would move the left side of a diff already shown.
    if (await this.hasAssessment(userId, taxYear)) {
      throw new ConflictError('SUBMISSION_HAS_ASSESSMENT', 'A Bescheid is recorded for this year; the filed version stays as it was.')
    }

    const frozen = await this.frozenReturn(userId, taxYear)
    const { replacedPrevious } = await this.submissions.record({ userId, taxYear, submittedOn: dto.submittedOn, ...frozen })
    return { status: 'eingereicht', submittedOn: dto.submittedOn, replacedPrevious }
  }

  async withdraw(userId: string, taxYear: number): Promise<void> {
    const [status, version] = await Promise.all([this.submissions.yearStatus(userId, taxYear), this.versions.findLatest(userId, taxYear)])
    if (version === null || status === null || !canWithdrawSubmission(status)) {
      throw new NotFoundError('SUBMISSION_NOT_FOUND', `Tax year ${taxYear} has no submission to undo.`)
    }
    if (await this.hasAssessment(userId, taxYear)) {
      throw new ConflictError('SUBMISSION_HAS_ASSESSMENT', 'A Bescheid is recorded for this year; the submission can no longer be undone.')
    }
    await this.submissions.withdraw(userId, taxYear)
  }

  /** Null until the user has recorded a submission in the app. */
  async state(userId: string, taxYear: number): Promise<SubmissionState | null> {
    const [status, version] = await Promise.all([this.submissions.yearStatus(userId, taxYear), this.versions.findLatest(userId, taxYear)])
    if (version === null || status === null) return null
    const withdrawable = canWithdrawSubmission(status) && !(await this.hasAssessment(userId, taxYear))
    return { status, submittedOn: version.submittedOn, withdrawable }
  }

  /** A Bescheid counts once anything of it is read or its date is set; an empty row is none. */
  private async hasAssessment(userId: string, taxYear: number): Promise<boolean> {
    const record = await this.assessments.findForUserAndYear(userId, taxYear)
    return record !== null && (hasAssessedValues(record) || record.assessmentDate !== null)
  }

  /**
   * The return as it stands today, read the way the Verlauf reads a year (person-facts.ts): the facts of
   * each person and the Cockpit's estimate for zvE, tax and refund. Person B joins a joint return only
   * where this account keeps B's figures (ADR-0054).
   */
  private async frozenReturn(userId: string, taxYear: number): Promise<{ filingType: 'einzel' | 'zusammen'; positions: AssessmentPositionValues; estimateAtSubmission: Range | null }> {
    const link = await this.link.findByUserAndYear(userId, taxYear)
    const filingType: 'einzel' | 'zusammen' = link?.filingType === 'zusammen' ? 'zusammen' : 'einzel'
    const spouseUserId = filingType === 'zusammen' ? recordedSpouseUserId(link, userId) : null
    const [a, b, estimate] = await Promise.all([
      this.personFacts(userId, taxYear),
      spouseUserId === null ? Promise.resolve(null) : this.personFacts(spouseUserId, taxYear),
      this.estimate(userId, taxYear),
    ])
    return { filingType, positions: filedPositions({ filingType, people: { A: a, B: b }, estimate }), estimateAtSubmission: estimate?.result ?? null }
  }

  private async personFacts(dataUserId: string, taxYear: number): Promise<PersonYearFacts> {
    const [lstbRecord, chRecord, path, rows] = await Promise.all([
      this.lstb.findForUserAndYear(dataUserId, taxYear),
      this.ch.findForUserAndYear(dataUserId, taxYear),
      this.commute.findForUserAndYear(dataUserId, taxYear),
      this.interview.findAllForUserAndYear(dataUserId, taxYear),
    ])
    return { wage: wageFacts(lstbRecord, chRecord), declaredWorkExpenses: todaysWorkExpenses(taxYear, path, rows) }
  }

  /** The Cockpit's estimate (ADR-0094); without one only the facts are frozen, no tax figure is made up. */
  private async estimate(userId: string, taxYear: number): Promise<SubmissionEstimate | null> {
    try {
      const state = await this.estimates.getState(userId, taxYear)
      return state.kind === 'spanne' ? state : null
    } catch {
      return null
    }
  }
}
