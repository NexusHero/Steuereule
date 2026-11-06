import { Inject, Injectable } from '@nestjs/common'
import { InvalidInputError } from '../common/domain-error.js'
import {
  SALARY_CERTIFICATE_FIELDS,
  officialMonthlyRate,
  chItemsAsCoreItems,
  deserializeSalaryCertificateField,
  gatedIncomeTypes,
  crossBorderChItems,
  crossBorderFold,
  isValidSalaryCertificateAmount,
  serializeSalaryCertificateField,
  actualRate,
  type Answers,
  type CalculationStatus,
  type ChItem,
  type SalaryCertificateValues,
  type ExchangeRate,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import {
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRepository,
} from '../interview/interview-answer.repository.js'
import {
  CROSS_BORDER_SALARY_STATEMENT_REPOSITORY,
  EMPTY_N_GRE,
  type CrossBorderSalaryStatementRecord,
  type CrossBorderSalaryStatementRepository,
  type NGreDetails,
} from './ch-lohnausweis.repository.js'
import type { SalaryCertificateFieldDto, PutSalaryCertificateFieldDto } from './dto/lohnausweis-feld.dto.js'
import type { PutExchangeRateDto, ExchangeRateDto } from './dto/wechselkurs.dto.js'
import type { ChItemDto, NGreDetailsDto, PutRemarksDto, PutNGreDto, PutProvisionDto } from './dto/ch-posten.dto.js'
import type { CalculationStatusDto, ChSalaryCertificateResponseDto } from './dto/ch-lohnausweis-response.dto.js'
import { crossBorderStatusFromAnswers, exchangeRateFromRecord } from './lohnausweis-daten.js'

function fieldsFromRecord(record: CrossBorderSalaryStatementRecord | null): { fields: SalaryCertificateFieldDto[]; values: SalaryCertificateValues } {
  const fields: SalaryCertificateFieldDto[] = []
  const values: SalaryCertificateValues = {}
  for (const field of SALARY_CERTIFICATE_FIELDS) {
    if (field.kind !== 'chf-betrag') continue
    const stored = record === null ? null : record.fields[field.id as keyof CrossBorderSalaryStatementRecord['fields']]
    const value = deserializeSalaryCertificateField(stored)
    if (value === null) {
      fields.push({ id: field.id, digit: field.digit, kind: 'offen' })
    } else if (value === 'unklar') {
      fields.push({ id: field.id, digit: field.digit, kind: 'unklar' })
    } else {
      fields.push({ id: field.id, digit: field.digit, kind: 'erfasst', value })
      values[field.id] = value
    }
  }
  return { fields, values }
}


function exchangeRateToDto(rate: ExchangeRate): ExchangeRateDto {
  return { month: rate.month, rate: rate.rate, mode: rate.mode, ...(rate.receiptId !== undefined ? { receiptId: rate.receiptId } : {}) }
}

function statusToDto(status: CalculationStatus): CalculationStatusDto {
  if (status.kind === 'bestimmt') {
    return { kind: 'bestimmt', einnahmen: status.einnahmen, vorsorgeaufwand: status.vorsorgeaufwand, anrechnung: status.anrechnung }
  }
  return {
    kind: 'offen',
    einnahmen: status.einnahmen,
    vorsorgeaufwand: status.vorsorgeaufwand,
    anrechnung: status.anrechnung,
    openItems: status.openItems,
    conflicts: status.conflicts,
    gated: [...status.gated],
  }
}

function itemToDto(items: ChItem): ChItemDto {
  const kern = chItemsAsCoreItems(items)
  return {
    id: items.id,
    kind: items.kind,
    ...(items.digit !== undefined ? { digit: items.digit } : {}),
    amountChf: items.amountChf,
    amountEur: items.amountEur,
    role: kern?.role ?? 'einnahme',
    exchangeRate: exchangeRateToDto(items.exchangeRate),
  }
}

function valueFromDto(dto: PutSalaryCertificateFieldDto): string | null {
  if (dto.kind === 'offen') return null
  if (dto.kind === 'unklar') return 'unklar'
  if (dto.value === undefined || !isValidSalaryCertificateAmount(dto.value)) {
    throw new InvalidInputError('FIELD_VALUE_INVALID', 'kind "erfasst" requires a non-negative whole-CHF `wert`.')
  }
  return serializeSalaryCertificateField(dto.value)
}


function nGreToDto(n: NGreDetails): NGreDetailsDto {
  const number = (value: string | null): number | null => (value === null ? null : Number(value))
  return {
    arbeitgeberName: n.arbeitgeberName,
    arbeitgeberStrasse: n.arbeitgeberStrasse,
    arbeitgeberPlzOrt: n.arbeitgeberPlzOrt,
    familienzulagenChf: number(n.familienzulagenChf),
    krankentaggeldChf: number(n.krankentaggeldChf),
    pkArbeitnehmerChf: number(n.pkArbeitnehmerChf),
    pkArbeitgeberChf: number(n.pkArbeitgeberChf),
    krankentaggeldArbeitgeberProzent: number(n.krankentaggeldArbeitgeberProzent),
    krankentaggeldArbeitgeberChf: number(n.krankentaggeldArbeitgeberChf),
    nbuvArbeitgeberProzent: number(n.nbuvArbeitgeberProzent),
    nbuvArbeitgeberChf: number(n.nbuvArbeitgeberChf),
    specialCases: n.nGreSonderfaelle,
  }
}

/** Application logic for the CH-Lohnausweis guided mask + fold. */
@Injectable()
export class ChSalaryCertificateService {
  constructor(
    @Inject(CROSS_BORDER_SALARY_STATEMENT_REPOSITORY) private readonly repository: CrossBorderSalaryStatementRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepository: InterviewAnswerRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  private async answers(userId: string, taxYear: number): Promise<Answers> {
    const rows = await this.interviewRepository.findAllForUserAndYear(userId, taxYear)
    const answers: Record<string, string> = {}
    for (const row of rows) answers[row.questionId] = row.value
    return answers as Answers
  }

  private async toResponse(userId: string, taxYear: number, record: CrossBorderSalaryStatementRecord | null): Promise<ChSalaryCertificateResponseDto> {
    const { fields, values } = fieldsFromRecord(record)
    const exchangeRate = exchangeRateFromRecord(record)
    const answers = await this.answers(userId, taxYear)
    const status = crossBorderStatusFromAnswers(answers)
    const gated = gatedIncomeTypes(answers)

    const saeule3aChf = record === null || record.saeule3aChf === null ? undefined : Number(record.saeule3aChf)
    const krankenkasseChf = record === null || record.krankenkasseChf === null ? undefined : Number(record.krankenkasseChf)

    let items: ChItemDto[] = []
    let foldStatus: CalculationStatusDto | null = null
    if (exchangeRate !== null && status !== null) {
      const chItems = crossBorderChItems({
        salaryCertificate: values,
        ...(saeule3aChf !== undefined ? { saeule3aChf } : {}),
        ...(krankenkasseChf !== undefined ? { krankenkasseChf } : {}),
        exchangeRate,
      })
      items = chItems.map(itemToDto)
      foldStatus = statusToDto(
        crossBorderFold({
          salaryCertificate: values,
          ...(saeule3aChf !== undefined ? { saeule3aChf } : {}),
          ...(krankenkasseChf !== undefined ? { krankenkasseChf } : {}),
          status,
          exchangeRate,
          gated,
        }),
      )
    }

    return {
      fields,
      bemerkungen: record?.bemerkungen ?? null,
      exchangeRate: exchangeRate === null ? null : exchangeRateToDto(exchangeRate),
      status,
      items,
      foldStatus,
      nGre: nGreToDto(record?.nGre ?? EMPTY_N_GRE),
    }
  }

  async getState(userId: string, taxYear: number): Promise<ChSalaryCertificateResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, taxYear)
    if (record !== null) {
      await this.auditService.append({ userId, action: 'READ', resource: 'ch-lohnausweis' })
    }
    return this.toResponse(userId, taxYear, record)
  }

  async setField(
    userId: string,
    taxYear: number,
    field: Parameters<CrossBorderSalaryStatementRepository['setField']>[2],
    dto: PutSalaryCertificateFieldDto,
  ): Promise<ChSalaryCertificateResponseDto> {
    const record = await this.repository.setField(userId, taxYear, field, valueFromDto(dto))
    return this.toResponse(userId, taxYear, record)
  }

  async setRemarks(userId: string, taxYear: number, dto: PutRemarksDto): Promise<ChSalaryCertificateResponseDto> {
    const record = await this.repository.setRemarks(userId, taxYear, dto.text ?? null)
    return this.toResponse(userId, taxYear, record)
  }

  async setProvision(userId: string, taxYear: number, dto: PutProvisionDto): Promise<ChSalaryCertificateResponseDto> {
    const saeule3aChf = this.serializeOptional(dto.saeule3aChf)
    const krankenkasseChf = this.serializeOptional(dto.krankenkasseChf)
    const record = await this.repository.setProvision(userId, taxYear, saeule3aChf, krankenkasseChf)
    return this.toResponse(userId, taxYear, record)
  }

  async setNGre(userId: string, taxYear: number, dto: PutNGreDto): Promise<ChSalaryCertificateResponseDto> {
    const { specialCases, ...rest } = dto
    const details: Partial<NGreDetails> = {}
    for (const [field, value] of Object.entries(rest)) {
      if (value === undefined) continue
      details[field as Exclude<keyof NGreDetails, 'nGreSonderfaelle'>] = value === null ? null : String(value)
    }
    if (specialCases !== undefined) details.nGreSonderfaelle = specialCases
    const record = await this.repository.setNGre(userId, taxYear, details)
    return this.toResponse(userId, taxYear, record)
  }

  async setExchangeRate(userId: string, taxYear: number, dto: PutExchangeRateDto): Promise<ChSalaryCertificateResponseDto> {
    let rate: ExchangeRate
    try {
      rate =
        dto.mode === 'amtlich'
          ? officialMonthlyRate(dto.month, dto.rate)
          : actualRate(dto.month, dto.rate, dto.receiptId ?? '')
    } catch (error) {
      if (error instanceof RangeError) {
        throw new InvalidInputError('WECHSELKURS_INVALID', error.message)
      }
      throw error
    }
    const record = await this.repository.setExchangeRate(userId, taxYear, {
      month: rate.month,
      rate: rate.rate,
      mode: rate.mode,
      ...(rate.receiptId !== undefined ? { receiptId: rate.receiptId } : {}),
    })
    return this.toResponse(userId, taxYear, record)
  }

  private serializeOptional(value: number | null | undefined): string | null {
    if (value === null || value === undefined) return null
    if (!isValidSalaryCertificateAmount(value)) {
      throw new InvalidInputError('FIELD_VALUE_INVALID', 'A whole-CHF amount must be a non-negative integer.')
    }
    return String(value)
  }
}
