import { Inject, Injectable } from '@nestjs/common'
import { InvalidInputError, NotFoundError } from '../common/domain-error.js'
import {
  deserializeRentalField,
  gatedIncomeTypes,
  isValidRentalAmount,
  classifyRental,
  serializeRentalField,
  setRentalField,
  rentalPropertyFacts,
  rentalStatus,
  type Answers,
  type RentalFieldId,
  type RentalFieldState,
  provenanceKey,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { PROVENANCE_REPOSITORY, type ProvenanceRepository } from '../marking/marking.repository.js'
import {
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRepository,
} from '../interview/interview-answer.repository.js'
import { RENTAL_REPOSITORY, type RentalObjectRecord, type RentalRepository } from './rental.repository.js'
import type { PutRentalFieldDto, RentalFieldDto } from './dto/rental-field.dto.js'
import type { PutRentalAddressDto } from './dto/rental-address.dto.js'
import type {
  RentalClassificationDto,
  RentalPropertyDto,
  RentalPropertyFactsDto,
  RentalResponseDto,
  RentalStatusDto,
} from './dto/rental-response.dto.js'
import { answersFrom } from '../interview/answers.js'

function dataFromRecord(record: RentalObjectRecord) {
  return {
    id: record.id,
    mieteinnahmen: deserializeRentalField(record.mieteinnahmen),
    anschaffungskosten: deserializeRentalField(record.anschaffungskosten),
    baujahr: deserializeRentalField(record.baujahr),
    werbungskosten: deserializeRentalField(record.werbungskosten),
  }
}

function stateFromDto(dto: PutRentalFieldDto): RentalFieldState {
  if (dto.kind === 'offen') return { kind: 'offen' }
  if (dto.kind === 'unklar') return { kind: 'unklar' }
  if (dto.value === undefined || !isValidRentalAmount(dto.value)) {
    throw new InvalidInputError('FIELD_VALUE_INVALID', 'kind "erfasst" requires a non-negative integer `wert`.')
  }
  return { kind: 'erfasst', value: dto.value }
}

function toFieldDto(state: RentalFieldState): RentalFieldDto {
  switch (state.kind) {
    case 'offen':
      return { kind: 'offen' }
    case 'unklar':
      return { kind: 'unklar' }
    case 'erfasst':
      return { kind: 'erfasst', value: state.value }
  }
}

function propertyToDto(record: RentalObjectRecord): RentalPropertyDto {
  const data = dataFromRecord(record)
  const facts = rentalPropertyFacts(data)
  const factsDto: RentalPropertyFactsDto = {
    einnahmen: facts.einnahmen,
    werbungskosten: facts.werbungskosten,
    depreciation: facts.depreciation,
    openItems: facts.openItems,
  }
  return {
    id: data.id,
    mieteinnahmen: toFieldDto(data.mieteinnahmen),
    anschaffungskosten: toFieldDto(data.anschaffungskosten),
    baujahr: toFieldDto(data.baujahr),
    werbungskosten: toFieldDto(data.werbungskosten),
    strasse: record.strasse ?? null,
    hausnummer: record.hausnummer ?? null,
    plz: record.plz ?? null,
    city: record.city ?? null,
    livingArea: record.livingArea ?? null,
    depreciationAsLastYear: record.depreciationAsLastYear ?? null,
    umlagen: record.umlagen ?? null,
    schuldzinsen: record.schuldzinsen ?? null,
    einheiten: record.einheiten ?? null,
    anteilA: record.anteilA ?? null,
    facts: factsDto,
  }
}

/** Application logic for the Vermietung guided mask + fold. */
@Injectable()
export class RentalService {
  constructor(
    @Inject(RENTAL_REPOSITORY) private readonly repository: RentalRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepository: InterviewAnswerRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PROVENANCE_REPOSITORY) private readonly markings: ProvenanceRepository,
  ) {}

  private async answers(userId: string, taxYear: number): Promise<Answers> {
    const rows = await this.interviewRepository.findAllForUserAndYear(userId, taxYear)
    return answersFrom(rows)
  }

  private async toResponse(userId: string, taxYear: number, records: RentalObjectRecord[]): Promise<RentalResponseDto> {
    const answers = await this.answers(userId, taxYear)
    const gated = gatedIncomeTypes(answers)
    const classification: RentalClassificationDto = classifyRental(answers['vermietung-art'])

    const properties = records.map((record) => dataFromRecord(record))
    const status = rentalStatus(properties, gated)

    const statusDto: RentalStatusDto =
      status.kind === 'bestimmt'
        ? {
            kind: 'bestimmt',
            einnahmen: status.einnahmen,
            vorsorgeaufwand: status.vorsorgeaufwand,
            anrechnung: status.anrechnung,
            werbungskosten: status.werbungskosten,
            depreciation: status.depreciation,
            openItems: status.openItems,
            conflicts: status.conflicts,
          }
        : {
            kind: 'offen',
            einnahmen: status.einnahmen,
            vorsorgeaufwand: status.vorsorgeaufwand,
            anrechnung: status.anrechnung,
            werbungskosten: status.werbungskosten,
            depreciation: status.depreciation,
            openItems: status.openItems,
            conflicts: status.conflicts,
            gated: [...status.gated],
          }

    return {
      classification,
      properties: records.map(propertyToDto),
      status: statusDto,
    }
  }

  async getState(userId: string, taxYear: number): Promise<RentalResponseDto> {
    const records = await this.repository.listForUserAndYear(userId, taxYear)
    if (records.length > 0) {
      await this.auditService.append({ userId, action: 'READ', resource: 'vermietung' })
    }
    return this.toResponse(userId, taxYear, records)
  }

  async createProperty(userId: string, taxYear: number): Promise<RentalResponseDto> {
    await this.repository.create(userId, taxYear)
    const records = await this.repository.listForUserAndYear(userId, taxYear)
    return this.toResponse(userId, taxYear, records)
  }

  async setField(userId: string, taxYear: number, propertyId: string, field: RentalFieldId, dto: PutRentalFieldDto): Promise<RentalResponseDto> {
    const state = stateFromDto(dto)
    const record = await this.repository.setField(userId, taxYear, propertyId, field, serializeRentalField(state))
    if (record === null) {
      throw new NotFoundError('VERMIETUNGSOBJEKT_NOT_FOUND', 'No such Vermietungsobjekt for this account and tax year.')
    }
    await this.markings.remove(userId, taxYear, [provenanceKey('vermietung', field, propertyId)])
    const data = dataFromRecord(record)
    setRentalField(data, field, state)
    const records = await this.repository.listForUserAndYear(userId, taxYear)
    return this.toResponse(userId, taxYear, records)
  }

  async setAddress(
    userId: string,
    taxYear: number,
    propertyId: string,
    dto: PutRentalAddressDto,
  ): Promise<RentalResponseDto> {
    const record = await this.repository.setAddress(userId, taxYear, propertyId, dto)
    if (record === null) {
      throw new NotFoundError('VERMIETUNGSOBJEKT_NOT_FOUND', 'No such Vermietungsobjekt for this account and tax year.')
    }
    const records = await this.repository.listForUserAndYear(userId, taxYear)
    return this.toResponse(userId, taxYear, records)
  }
}
