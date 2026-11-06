import { Inject, Injectable } from '@nestjs/common'
import { InvalidInputError } from '../common/domain-error.js'
import {
  EMPTY_PENSION,
  deserializePensionField,
  gatedIncomeTypes,
  isValidPensionAmount,
  isPensionType,
  pensionAsCoreLineItem,
  pensionStatus,
  serializePensionField,
  setPensionField,
  type Answers,
  type Item,
  type PensionData,
  type PensionFieldId,
  type PensionFieldState,
  provenanceKey,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { PROVENANCE_REPOSITORY, type ProvenanceRepository } from '../kennzeichnung/kennzeichnung.repository.js'
import {
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRepository,
} from '../interview/interview-answer.repository.js'
import { PENSION_REPOSITORY, type PensionRecord, type PensionRepository } from './rente.repository.js'
import type { PutPensionFieldDto, PensionFieldDto } from './dto/rente-feld.dto.js'
import type { PutPensionKindDto } from './dto/rente-art.dto.js'
import type { PensionItemDto, PensionResponseDto, PensionStatusDto } from './dto/rente-response.dto.js'

function dataFromRecord(record: PensionRecord | null): PensionData {
  if (record === null) return EMPTY_PENSION
  return {
    art: record.rentenart !== null && isPensionType(record.rentenart) ? record.rentenart : null,
    jahresbetrag: deserializePensionField(record.jahresbetrag),
    rentenbeginnJahr: deserializePensionField(record.rentenbeginnJahr),
    alterBeiRentenbeginn: deserializePensionField(record.alterBeiRentenbeginn),
  }
}

function stateFromDto(dto: PutPensionFieldDto): PensionFieldState {
  if (dto.kind === 'offen') return { kind: 'offen' }
  if (dto.kind === 'unklar') return { kind: 'unklar' }
  if (dto.value === undefined || !isValidPensionAmount(dto.value)) {
    throw new InvalidInputError('FIELD_VALUE_INVALID', 'kind "erfasst" requires a non-negative integer `wert`.')
  }
  return { kind: 'erfasst', value: dto.value }
}

function toFieldDto(state: PensionFieldState): PensionFieldDto {
  switch (state.kind) {
    case 'offen':
      return { kind: 'offen' }
    case 'unklar':
      return { kind: 'unklar' }
    case 'erfasst':
      return { kind: 'erfasst', value: state.value }
  }
}

function itemToDto(items: Item): PensionItemDto {
  const source = items.source
  return {
    id: items.id,
    amount: items.amount,
    provenance: source.art === 'regel' ? source.rule : 'eingabe',
  }
}

/** Application logic for the Rentner guided mask + fold. */
@Injectable()
export class PensionService {
  constructor(
    @Inject(PENSION_REPOSITORY) private readonly repository: PensionRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepository: InterviewAnswerRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PROVENANCE_REPOSITORY) private readonly markings: ProvenanceRepository,
  ) {}

  private async answers(userId: string, steuerjahr: number): Promise<Answers> {
    const rows = await this.interviewRepository.findAllForUserAndYear(userId, steuerjahr)
    const answers: Record<string, string> = {}
    for (const row of rows) answers[row.questionId] = row.value
    return answers as Answers
  }

  private async toResponse(userId: string, steuerjahr: number, record: PensionRecord | null): Promise<PensionResponseDto> {
    const data = dataFromRecord(record)
    const answers = await this.answers(userId, steuerjahr)
    const gated = gatedIncomeTypes(answers)

    const coreItems = pensionAsCoreLineItem(data)
    const items: PensionItemDto[] = coreItems === null ? [] : [itemToDto(coreItems)]
    const status = pensionStatus(data, gated)

    const statusDto: PensionStatusDto =
      status.kind === 'bestimmt'
        ? { kind: 'bestimmt', einnahmen: status.einnahmen, vorsorgeaufwand: status.vorsorgeaufwand, anrechnung: status.anrechnung }
        : {
            kind: 'offen',
            einnahmen: status.einnahmen,
            vorsorgeaufwand: status.vorsorgeaufwand,
            anrechnung: status.anrechnung,
            openItems: status.openItems,
            conflicts: status.conflicts,
            gated: [...status.gated],
          }

    return {
      art: data.art,
      jahresbetrag: toFieldDto(data.jahresbetrag),
      rentenbeginnJahr: toFieldDto(data.rentenbeginnJahr),
      alterBeiRentenbeginn: toFieldDto(data.alterBeiRentenbeginn),
      items,
      status: statusDto,
    }
  }

  async getState(userId: string, steuerjahr: number): Promise<PensionResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, steuerjahr)
    if (record !== null) {
      await this.auditService.append({ userId, action: 'READ', resource: 'rente' })
    }
    return this.toResponse(userId, steuerjahr, record)
  }

  async setField(userId: string, steuerjahr: number, field: PensionFieldId, dto: PutPensionFieldDto): Promise<PensionResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, steuerjahr)
    const data = dataFromRecord(record)
    const state = stateFromDto(dto)
    setPensionField(data, field, state)
    const next = await this.repository.setField(userId, steuerjahr, field, serializePensionField(state))
    await this.markings.remove(userId, steuerjahr, [provenanceKey('rente', field)])
    return this.toResponse(userId, steuerjahr, next)
  }

  async setPensionKind(userId: string, steuerjahr: number, dto: PutPensionKindDto): Promise<PensionResponseDto> {
    const art = dto.art ?? null
    if (art !== null && !isPensionType(art)) {
      throw new InvalidInputError('RENTENART_UNKNOWN', 'art must be one of the five Rentenarten, or null.')
    }
    const record = await this.repository.setPensionKind(userId, steuerjahr, art)
    await this.markings.remove(userId, steuerjahr, [provenanceKey('rente', 'rentenart')])
    return this.toResponse(userId, steuerjahr, record)
  }
}
