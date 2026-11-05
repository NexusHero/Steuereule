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
  type Posten,
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
import type { PutRenteFeldDto, RenteFeldDto } from './dto/rente-feld.dto.js'
import type { PutRentenartDto } from './dto/rente-art.dto.js'
import type { RentePostenDto, RenteResponseDto, RenteStandDto } from './dto/rente-response.dto.js'

function datenAusRecord(record: PensionRecord | null): PensionData {
  if (record === null) return EMPTY_PENSION
  return {
    art: record.rentenart !== null && isPensionType(record.rentenart) ? record.rentenart : null,
    jahresbetrag: deserializePensionField(record.jahresbetrag),
    rentenbeginnJahr: deserializePensionField(record.rentenbeginnJahr),
    alterBeiRentenbeginn: deserializePensionField(record.alterBeiRentenbeginn),
  }
}

function zustandAusDto(dto: PutRenteFeldDto): PensionFieldState {
  if (dto.kind === 'offen') return { kind: 'offen' }
  if (dto.kind === 'unklar') return { kind: 'unklar' }
  if (dto.wert === undefined || !isValidPensionAmount(dto.wert)) {
    throw new InvalidInputError('FIELD_VALUE_INVALID', 'kind "erfasst" requires a non-negative integer `wert`.')
  }
  return { kind: 'erfasst', wert: dto.wert }
}

function toFeldDto(zustand: PensionFieldState): RenteFeldDto {
  switch (zustand.kind) {
    case 'offen':
      return { kind: 'offen' }
    case 'unklar':
      return { kind: 'unklar' }
    case 'erfasst':
      return { kind: 'erfasst', wert: zustand.wert }
  }
}

function postenZuDto(posten: Posten): RentePostenDto {
  const quelle = posten.quelle
  return {
    id: posten.id,
    betrag: posten.betrag,
    herkunft: quelle.art === 'regel' ? quelle.regel : 'eingabe',
  }
}

/** Application logic for the Rentner guided mask + fold. */
@Injectable()
export class RenteService {
  constructor(
    @Inject(PENSION_REPOSITORY) private readonly repository: PensionRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepository: InterviewAnswerRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PROVENANCE_REPOSITORY) private readonly kennzeichnungen: ProvenanceRepository,
  ) {}

  private async antworten(userId: string, steuerjahr: number): Promise<Answers> {
    const rows = await this.interviewRepository.findAllForUserAndYear(userId, steuerjahr)
    const answers: Record<string, string> = {}
    for (const row of rows) answers[row.questionId] = row.value
    return answers as Answers
  }

  private async toResponse(userId: string, steuerjahr: number, record: PensionRecord | null): Promise<RenteResponseDto> {
    const daten = datenAusRecord(record)
    const answers = await this.antworten(userId, steuerjahr)
    const gegated = gatedIncomeTypes(answers)

    const kernposten = pensionAsCoreLineItem(daten)
    const posten: RentePostenDto[] = kernposten === null ? [] : [postenZuDto(kernposten)]
    const stand = pensionStatus(daten, gegated)

    const standDto: RenteStandDto =
      stand.kind === 'bestimmt'
        ? { kind: 'bestimmt', einnahmen: stand.einnahmen, vorsorgeaufwand: stand.vorsorgeaufwand, anrechnung: stand.anrechnung }
        : {
            kind: 'offen',
            einnahmen: stand.einnahmen,
            vorsorgeaufwand: stand.vorsorgeaufwand,
            anrechnung: stand.anrechnung,
            offenePosten: stand.offenePosten,
            konflikte: stand.konflikte,
            gegated: [...stand.gegated],
          }

    return {
      art: daten.art,
      jahresbetrag: toFeldDto(daten.jahresbetrag),
      rentenbeginnJahr: toFeldDto(daten.rentenbeginnJahr),
      alterBeiRentenbeginn: toFeldDto(daten.alterBeiRentenbeginn),
      posten,
      stand: standDto,
    }
  }

  async getState(userId: string, steuerjahr: number): Promise<RenteResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, steuerjahr)
    if (record !== null) {
      await this.auditService.append({ userId, action: 'READ', resource: 'rente' })
    }
    return this.toResponse(userId, steuerjahr, record)
  }

  async setFeld(userId: string, steuerjahr: number, feld: PensionFieldId, dto: PutRenteFeldDto): Promise<RenteResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, steuerjahr)
    const daten = datenAusRecord(record)
    const zustand = zustandAusDto(dto)
    setPensionField(daten, feld, zustand)
    const next = await this.repository.setFeld(userId, steuerjahr, feld, serializePensionField(zustand))
    await this.kennzeichnungen.entferne(userId, steuerjahr, [provenanceKey('rente', feld)])
    return this.toResponse(userId, steuerjahr, next)
  }

  async setRentenart(userId: string, steuerjahr: number, dto: PutRentenartDto): Promise<RenteResponseDto> {
    const art = dto.art ?? null
    if (art !== null && !isPensionType(art)) {
      throw new InvalidInputError('RENTENART_UNKNOWN', 'art must be one of the five Rentenarten, or null.')
    }
    const record = await this.repository.setRentenart(userId, steuerjahr, art)
    await this.kennzeichnungen.entferne(userId, steuerjahr, [provenanceKey('rente', 'rentenart')])
    return this.toResponse(userId, steuerjahr, record)
  }
}
