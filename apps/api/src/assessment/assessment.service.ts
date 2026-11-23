import { Inject, Injectable, Optional } from '@nestjs/common'
import { ConflictError, InvalidInputError } from '../common/domain-error.js'
import {
  ASSESSMENT_FIELDS,
  employeeFromData,
  assessmentCalculationStatus,
  deserializeAssessmentField,
  deserializeWageTaxCertificateField,
  ASSESSMENT_POSITIONS,
  appealDeadline,
  diffAssessment,
  gatedIncomeTypes,
  isValidAssessmentPositionAmount,
  type AssessmentField,
  type AssessmentPositionId,
  reconcileAssessment,
  crossBorderFold,
  isAssessmentTransitionAllowed,
  isAppealOutcome,
  isAppealReason,
  isValidAssessmentAmount,
  nextAssessmentStates,
  serializeAssessmentField,
  todayIso,
  ISO_DATE_PATTERN,
  type CalculationStatus,
  type AssessmentStatus,
  type AssessmentValues,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { TAX_CASE_READER, type TaxCaseReader } from '../tax-case/tax-case.reader.js'
import { ASSESSMENT_REPOSITORY, type AssessmentRecord, type AssessmentRepository, type AssessmentStoredField } from './assessment.repository.js'
import { assessedReturnOf, filedReturnOf, hasAssessedValues, positionValue } from './assessment-positions.js'
import { FILING_VERSION_REPOSITORY, type FilingVersionRepository } from './filing-version.repository.js'
import type { AssessmentFieldDto, PutAssessmentFieldDto } from './dto/assessment-field.dto.js'
import { toDiffDto } from './assessment-diff.mapper.js'
import type {
  AssessmentDeviationDto,
  AssessmentResponseDto,
  SetAssessmentDateDto,
  SetAssessmentStatusDto,
  SetAppealDto,
  SetAppealOutcomeDto,
} from './dto/assessment-response.dto.js'
import { answersFrom } from '../interview/answers.js'
import { crossBorderStatusFromAnswers, salaryCertificateValuesFromRecord, exchangeRateFromRecord } from '../ch-salary-certificate/salary-certificate-data.js'
import { interviewOptions } from '../config/self-employment.js'


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
    @Inject(TAX_CASE_READER) private readonly cases: TaxCaseReader,
    @Inject(AuditService) private readonly auditService: AuditService,
    /** The versions frozen at submission (ADR-0098 §8); without them there is no diff to show. */
    @Optional() @Inject(FILING_VERSION_REPOSITORY) private readonly filingVersions?: FilingVersionRepository,
  ) {}

  private async calculationStatus(userId: string, taxYear: number): Promise<CalculationStatus> {
    const {
      wageTaxCertificate: lstbRecord,
      interviewRows,
      salaryStatement: chRecord,
    } = await this.cases.read(userId, taxYear, ['wageTaxCertificate', 'interviewRows', 'salaryStatement'])
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
        gated: gatedIncomeTypes(answers, interviewOptions()),
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

    const deadline = assessmentDate === null ? null : appealDeadline(assessmentDate, todayIso())
    const version = this.filingVersions ? await this.filingVersions.findLatest(userId, taxYear) : null
    // The cockpit's Bescheidprüfung shows the very diff the Verlauf shows (ADR-0098 §8).
    const diff = version !== null && hasAssessedValues(record) ? diffAssessment(filedReturnOf(version), assessedReturnOf(record)) : null

    return {
      status,
      assessmentDate,
      appealReason,
      appealDate: record?.appealDate ?? null,
      appealOutcome: record?.appealOutcome ?? null,
      appealOutcomeAmount: record?.appealOutcomeAmount !== null && record?.appealOutcomeAmount !== undefined && /^-?\d+$/.test(record.appealOutcomeAmount) ? Number(record.appealOutcomeAmount) : null,
      fields,
      reconciliation: {
        deviations: reconciliation.deviations.map((a): AssessmentDeviationDto => ({ ...a })),
        calculationIncomplete: reconciliation.calculationIncomplete,
      },
      frist: { assessmentDate, deadlineEnd: deadline?.endsOn ?? null, remainingDays: deadline?.remainingDays ?? null, running: deadline?.running ?? null },
      nextStates: [...nextAssessmentStates(status)],
      positions: ASSESSMENT_POSITIONS.map((p) => positionDto(record, p.id)),
      explanations: (record?.explanations ?? '').split('\n').filter((t) => t.trim() !== ''),
      diff: diff === null ? null : toDiffDto(diff),
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
    field: AssessmentStoredField,
    dto: PutAssessmentFieldDto,
  ): Promise<AssessmentResponseDto> {
    const record = await this.repository.setField(userId, taxYear, field, valueFromDto(field, dto))
    return this.toResponse(userId, taxYear, record)
  }

  async setDate(userId: string, taxYear: number, dto: SetAssessmentDateDto): Promise<AssessmentResponseDto> {
    if (dto.date !== null && dto.date !== undefined && !ISO_DATE_PATTERN.test(dto.date)) {
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
    const date = dto.date ?? todayIso()
    if (!ISO_DATE_PATTERN.test(date)) {
      throw new InvalidInputError('EINSPRUCH_DATUM_INVALID', 'date must be an ISO yyyy-mm-dd date.')
    }
    const current = await this.repository.findForUserAndYear(userId, taxYear)
    const from: AssessmentStatus = current?.status ?? 'eingegangen'
    if (!isAssessmentTransitionAllowed(from, 'einspruch-eingelegt')) {
      throw new ConflictError('BESCHEID_TRANSITION_ILLEGAL', `illegal Bescheid transition "${from}" → "einspruch-eingelegt"`)
    }
    const record = await this.repository.setAppeal(userId, taxYear, dto.reason, date)
    return this.toResponse(userId, taxYear, record)
  }

  /** How the Einspruch ended (ADR-0099 §8): only an Einspruch that was lodged has an outcome. */
  async setAppealOutcome(userId: string, taxYear: number, dto: SetAppealOutcomeDto): Promise<AssessmentResponseDto> {
    if (!isAppealOutcome(dto.outcome)) {
      throw new InvalidInputError('EINSPRUCH_ERGEBNIS_UNKNOWN', `unknown Einspruch-Ergebnis "${dto.outcome}"`)
    }
    const amount = dto.amount ?? null
    if (amount !== null && !Number.isInteger(amount)) {
      throw new InvalidInputError('EINSPRUCH_BETRAG_INVALID', 'amount must be whole euros or null.')
    }
    const current = await this.repository.findForUserAndYear(userId, taxYear)
    if (current?.status !== 'einspruch-eingelegt') {
      throw new ConflictError('EINSPRUCH_FEHLT', 'There is no Einspruch for this Bescheid to record an outcome for.')
    }
    const record = await this.repository.setAppealOutcome(userId, taxYear, dto.outcome, amount === null ? null : String(amount))
    return this.toResponse(userId, taxYear, record)
  }
}

function valueFromDto(field: AssessmentStoredField, dto: PutAssessmentFieldDto): string | null {
  if (dto.kind === 'offen') return null
  if (dto.kind === 'unklar') return 'unklar'
  const original = ASSESSMENT_FIELDS.some((f) => f.id === field)
  const valid =
    dto.value !== undefined &&
    (original ? isValidAssessmentAmount(field as AssessmentField, dto.value) : isValidAssessmentPositionAmount(field as AssessmentPositionId, dto.value))
  if (!valid) {
    throw new InvalidInputError('FIELD_VALUE_INVALID', `kind "erfasst" requires a valid whole-euro \`wert\` for "${field}".`)
  }
  return original ? serializeAssessmentField(field as AssessmentField, dto.value!) : String(dto.value)
}

function positionDto(record: AssessmentRecord | null, id: AssessmentPositionId): AssessmentFieldDto {
  const value = positionValue(record, id)
  if (value === null) return { id, kind: 'offen' }
  if (value === 'unklar') return { id, kind: 'unklar' }
  return { id, kind: 'erfasst', value }
}

/** Today in Germany; the shared date module decides, re-exported here for the existing callers. */
export { todayIso } from '@steuereule/core'
