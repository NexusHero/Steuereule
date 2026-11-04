import { Inject, Injectable } from '@nestjs/common'
import { InvalidInputError } from '../common/domain-error.js'
import {
  LEERE_RENTE,
  deserialisiereRentenFeld,
  gatedEinkunftsarten,
  istGueltigerRentenBetrag,
  isRentenart,
  renteAlsKernposten,
  renteStand,
  serialisiereRentenFeld,
  setzeRentenFeld,
  type Answers,
  type Posten,
  type RentenDaten,
  type RentenFeldId,
  type RentenFeldZustand,
  kennzeichnungsKey,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { KENNZEICHNUNG_REPOSITORY, type KennzeichnungRepository } from '../kennzeichnung/kennzeichnung.repository.js'
import {
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRepository,
} from '../interview/interview-answer.repository.js'
import { RENTE_REPOSITORY, type RenteRecord, type RenteRepository } from './rente.repository.js'
import type { PutRenteFeldDto, RenteFeldDto } from './dto/rente-feld.dto.js'
import type { PutRentenartDto } from './dto/rente-art.dto.js'
import type { RentePostenDto, RenteResponseDto, RenteStandDto } from './dto/rente-response.dto.js'

function datenAusRecord(record: RenteRecord | null): RentenDaten {
  if (record === null) return LEERE_RENTE
  return {
    art: record.rentenart !== null && isRentenart(record.rentenart) ? record.rentenart : null,
    jahresbetrag: deserialisiereRentenFeld(record.jahresbetrag),
    rentenbeginnJahr: deserialisiereRentenFeld(record.rentenbeginnJahr),
    alterBeiRentenbeginn: deserialisiereRentenFeld(record.alterBeiRentenbeginn),
  }
}

function zustandAusDto(dto: PutRenteFeldDto): RentenFeldZustand {
  if (dto.kind === 'offen') return { kind: 'offen' }
  if (dto.kind === 'unklar') return { kind: 'unklar' }
  if (dto.wert === undefined || !istGueltigerRentenBetrag(dto.wert)) {
    throw new InvalidInputError('FIELD_VALUE_INVALID', 'kind "erfasst" requires a non-negative integer `wert`.')
  }
  return { kind: 'erfasst', wert: dto.wert }
}

function toFeldDto(zustand: RentenFeldZustand): RenteFeldDto {
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
    @Inject(RENTE_REPOSITORY) private readonly repository: RenteRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepository: InterviewAnswerRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(KENNZEICHNUNG_REPOSITORY) private readonly kennzeichnungen: KennzeichnungRepository,
  ) {}

  private async antworten(userId: string, steuerjahr: number): Promise<Answers> {
    const rows = await this.interviewRepository.findAllForUserAndYear(userId, steuerjahr)
    const answers: Record<string, string> = {}
    for (const row of rows) answers[row.questionId] = row.value
    return answers as Answers
  }

  private async toResponse(userId: string, steuerjahr: number, record: RenteRecord | null): Promise<RenteResponseDto> {
    const daten = datenAusRecord(record)
    const answers = await this.antworten(userId, steuerjahr)
    const gegated = gatedEinkunftsarten(answers)

    const kernposten = renteAlsKernposten(daten)
    const posten: RentePostenDto[] = kernposten === null ? [] : [postenZuDto(kernposten)]
    const stand = renteStand(daten, gegated)

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

  async setFeld(userId: string, steuerjahr: number, feld: RentenFeldId, dto: PutRenteFeldDto): Promise<RenteResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, steuerjahr)
    const daten = datenAusRecord(record)
    const zustand = zustandAusDto(dto)
    setzeRentenFeld(daten, feld, zustand)
    const next = await this.repository.setFeld(userId, steuerjahr, feld, serialisiereRentenFeld(zustand))
    await this.kennzeichnungen.entferne(userId, steuerjahr, [kennzeichnungsKey('rente', feld)])
    return this.toResponse(userId, steuerjahr, next)
  }

  async setRentenart(userId: string, steuerjahr: number, dto: PutRentenartDto): Promise<RenteResponseDto> {
    const art = dto.art ?? null
    if (art !== null && !isRentenart(art)) {
      throw new InvalidInputError('RENTENART_UNKNOWN', 'art must be one of the five Rentenarten, or null.')
    }
    const record = await this.repository.setRentenart(userId, steuerjahr, art)
    await this.kennzeichnungen.entferne(userId, steuerjahr, [kennzeichnungsKey('rente', 'rentenart')])
    return this.toResponse(userId, steuerjahr, record)
  }
}
