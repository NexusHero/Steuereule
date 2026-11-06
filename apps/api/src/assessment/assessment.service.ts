import { Inject, Injectable } from '@nestjs/common'
import { ConflictError, InvalidInputError } from '../common/domain-error.js'
import {
  ASSESSMENT_FIELDS,
  employeeFromData,
  assessmentCalculationStatus,
  deserializeAssessmentField,
  deserializeWageTaxCertificateField,
  appealDeadlineEnd,
  gatedIncomeTypes,
  reconcileAssessment,
  crossBorderFold,
  isAssessmentTransitionAllowed,
  isAppealReason,
  isValidAssessmentAmount,
  nextAssessmentStates,
  serializeAssessmentField,
  remainingAppealDays,
  type CalculationStatus,
  type AssessmentStatus,
  type AssessmentValues,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import {
  CROSS_BORDER_SALARY_STATEMENT_REPOSITORY,
  type CrossBorderSalaryStatementRepository,
} from '../ch-salary-certificate/ch-salary-certificate.repository.js'
import {
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRepository,
} from '../interview/interview-answer.repository.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from '../lstb/lstb.repository.js'
import { ASSESSMENT_REPOSITORY, type AssessmentRecord, type AssessmentRepository } from './assessment.repository.js'
import type { AssessmentFieldDto, PutAssessmentFieldDto } from './dto/assessment-field.dto.js'
import type {
  AssessmentDeviationDto,
  AssessmentResponseDto,
  SetAssessmentDateDto,
  SetAssessmentStatusDto,
  SetAppealDto,
} from './dto/assessment-response.dto.js'
import { answersFrom } from '../interview/answers.js'
import { crossBorderStatusFromAnswers, salaryCertificateValuesFromRecord, exchangeRateFromRecord } from '../ch-salary-certificate/salary-certificate-data.js'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function fieldsFromRecord(record: AssessmentRecord | null): { fields: AssessmentFieldDto[]; values: AssessmentValues } {
  const fields: AssessmentFieldDto[] = []
  const values: AssessmentValues = {}
  for (const field of ASSESSMENT_FIELDS) {
    const stored = record === null ? null : record.fields[field.id]
    const value = deserializeAssessmentField(field.id, stored)
    if (value === null) {
      fields.push({ id: field.id, kind: 'offen' })
    } else if (value === 'unklar') {
      fields.push({ id: field.id, kind: 'unklar' })
    } else {
      fields.push({ id: field.id, kind: 'erfasst', value })
      values[field.id] = value
    }
  }
  return { fields, values }
}




/** Application logic for the Steuerbescheid. */
@Injectable()
export class AssessmentService {
  constructor(
    @Inject(ASSESSMENT_REPOSITORY) private readonly repository: AssessmentRepository,
    @Inject(WAGE_TAX_CERTIFICATE_REPOSITORY) private readonly lstbRepository: WageTaxCertificateRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepository: InterviewAnswerRepository,
    @Inject(CROSS_BORDER_SALARY_STATEMENT_REPOSITORY) private readonly chSalaryCertificateRepository: CrossBorderSalaryStatementRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  private async calculationStatus(userId: string, taxYear: number): Promise<CalculationStatus> {
    const [lstbRecord, interviewRows, chRecord] = await Promise.all([
      this.lstbRepository.findForUserAndYear(userId, taxYear),
      this.interviewRepository.findAllForUserAndYear(userId, taxYear),
      this.chSalaryCertificateRepository.findForUserAndYear(userId, taxYear),
    ])
    const answers = answersFrom(interviewRows)

    const employee = employeeFromData(
      {
        bruttoarbeitslohn: deserializeWageTaxCertificateField(lstbRecord?.bruttoarbeitslohn ?? null),
        lohnsteuer: deserializeWageTaxCertificateField(lstbRecord?.lohnsteuer ?? null),
        sozialversicherung: deserializeWageTaxCertificateField(lstbRecord?.sozialversicherung ?? null),
      },
      answers,
    )

    const exchangeRate = exchangeRateFromRecord(chRecord)
    const status = crossBorderStatusFromAnswers(answers)
    const saeule3aChf = chRecord === null || chRecord.saeule3aChf === null ? undefined : Number(chRecord.saeule3aChf)
    const krankenkasseChf = chRecord === null || chRecord.krankenkasseChf === null ? undefined : Number(chRecord.krankenkasseChf)

    let ch: CalculationStatus | null = null
    if (exchangeRate !== null && status !== null) {
      ch = crossBorderFold({
        salaryCertificate: salaryCertificateValuesFromRecord(chRecord),
        ...(saeule3aChf !== undefined ? { saeule3aChf } : {}),
        ...(krankenkasseChf !== undefined ? { krankenkasseChf } : {}),
        status,
        exchangeRate,
        gated: gatedIncomeTypes(answers),
      })
    }

    return assessmentCalculationStatus(employee, ch)
  }

  private async toResponse(userId: string, taxYear: number, record: AssessmentRecord | null): Promise<AssessmentResponseDto> {
    const { fields, values } = fieldsFromRecord(record)
    const status: AssessmentStatus = record?.status ?? 'eingegangen'
    const assessmentDate = record?.assessmentDate ?? null
    const appealReason = record?.appealReason ?? null

    const foldStatus = await this.calculationStatus(userId, taxYear)
    const reconciliation = reconcileAssessment(values, foldStatus)

    const deadlineEnd = assessmentDate === null ? null : appealDeadlineEnd(assessmentDate)
    const remainingDays =
      deadlineEnd === null ? null : remainingAppealDays(assessmentDate as string, todayIso())

    return {
      status,
      assessmentDate,
      appealReason,
      fields,
      reconciliation: {
        deviations: reconciliation.deviations.map((a): AssessmentDeviationDto => ({ ...a })),
        calculationIncomplete: reconciliation.calculationIncomplete,
      },
      frist: { assessmentDate, deadlineEnd, remainingDays },
      nextStates: [...nextAssessmentStates(status)],
    }
  }

  async getState(userId: string, taxYear: number): Promise<AssessmentResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, taxYear)
    if (record !== null) {
      await this.auditService.append({ userId, action: 'READ', resource: 'bescheid' })
    }
    return this.toResponse(userId, taxYear, record)
  }

  async setField(
    userId: string,
    taxYear: number,
    field: Parameters<AssessmentRepository['setField']>[2],
    dto: PutAssessmentFieldDto,
  ): Promise<AssessmentResponseDto> {
    const record = await this.repository.setField(userId, taxYear, field, valueFromDto(field, dto))
    return this.toResponse(userId, taxYear, record)
  }

  async setDate(userId: string, taxYear: number, dto: SetAssessmentDateDto): Promise<AssessmentResponseDto> {
    if (dto.date !== null && dto.date !== undefined && !ISO_DATE_RE.test(dto.date)) {
      throw new InvalidInputError('BESCHEIDDATUM_INVALID', 'bescheiddatum must be an ISO yyyy-mm-dd date.')
    }
    const record = await this.repository.setDate(userId, taxYear, dto.date ?? null)
    return this.toResponse(userId, taxYear, record)
  }

  async setStatus(userId: string, taxYear: number, dto: SetAssessmentStatusDto): Promise<AssessmentResponseDto> {
    const current = await this.repository.findForUserAndYear(userId, taxYear)
    const from: AssessmentStatus = current?.status ?? 'eingegangen'
    const after = dto.status as AssessmentStatus
    if (!isAssessmentTransitionAllowed(from, after)) {
      throw new ConflictError('BESCHEID_TRANSITION_ILLEGAL', `illegal Bescheid transition "${from}" → "${after}"`)
    }
    const record = await this.repository.setStatus(userId, taxYear, after)
    return this.toResponse(userId, taxYear, record)
  }

  async setAppeal(userId: string, taxYear: number, dto: SetAppealDto): Promise<AssessmentResponseDto> {
    if (!isAppealReason(dto.reason)) {
      throw new InvalidInputError('EINSPRUCH_GRUND_UNKNOWN', `unknown Einspruch-Grund "${dto.reason}"`)
    }
    const current = await this.repository.findForUserAndYear(userId, taxYear)
    const from: AssessmentStatus = current?.status ?? 'eingegangen'
    if (!isAssessmentTransitionAllowed(from, 'einspruch-eingelegt')) {
      throw new ConflictError('BESCHEID_TRANSITION_ILLEGAL', `illegal Bescheid transition "${from}" → "einspruch-eingelegt"`)
    }
    const record = await this.repository.setAppeal(userId, taxYear, dto.reason)
    return this.toResponse(userId, taxYear, record)
  }
}

function valueFromDto(field: Parameters<AssessmentRepository['setField']>[2], dto: PutAssessmentFieldDto): string | null {
  if (dto.kind === 'offen') return null
  if (dto.kind === 'unklar') return 'unklar'
  if (dto.value === undefined || !isValidAssessmentAmount(field, dto.value)) {
    throw new InvalidInputError('FIELD_VALUE_INVALID', `kind "erfasst" requires a valid whole-euro \`wert\` for "${field}".`)
  }
  return serializeAssessmentField(field, dto.value)
}

export function todayIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const year = parts.find((p) => p.type === 'year')!.value
  const month = parts.find((p) => p.type === 'month')!.value
  const tag = parts.find((p) => p.type === 'day')!.value
  return `${year}-${month}-${tag}`
}
