// Application logic for the Rentner guided mask + fold (product ADR-034, Anlage R, ticket 10.4).
// userId+steuerjahr-scoped read/write, then the honest-state + fold mapping. Trusts that `userId`
// was produced by UserContextGuard + @RequiresAccount() (never accepts it from a param/body) —
// mirrors LstbService/ChLohnausweisService. The fold is NEVER computed here — @steuereule/core's
// `renteAlsKernposten`/`renteStand`/`deserialisiereRentenFeld`/`serialisiereRentenFeld`/
// `setzeRentenFeld`/`setzeRentenart` are imported, never reimplemented (ADR-014/048 determinism
// boundary). The gated Einkunftsarten are derived from the stored interview answers via the
// interview repository (the one read path), never trusted from the client — a pensioner who also
// declared Gewerbe/Krypto still reads OFFEN (ADR-030/034 combinability).
import { BadRequestException, Inject, Injectable } from '@nestjs/common'
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
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import {
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRepository,
} from '../interview/interview-answer.repository.js'
import { RENTE_REPOSITORY, type RenteRecord, type RenteRepository } from './rente.repository.js'
import type { PutRenteFeldDto, RenteFeldDto } from './dto/rente-feld.dto.js'
import type { PutRentenartDto } from './dto/rente-art.dto.js'
import type { RentePostenDto, RenteResponseDto, RenteStandDto } from './dto/rente-response.dto.js'

/** A stored row (or none) → the core's RentenDaten, via the ONE encoding in core/rente.ts. */
function datenAusRecord(record: RenteRecord | null): RentenDaten {
  if (record === null) return LEERE_RENTE
  return {
    art: record.rentenart !== null && isRentenart(record.rentenart) ? record.rentenart : null,
    jahresbetrag: deserialisiereRentenFeld(record.jahresbetrag),
    rentenbeginnJahr: deserialisiereRentenFeld(record.rentenbeginnJahr),
    alterBeiRentenbeginn: deserialisiereRentenFeld(record.alterBeiRentenbeginn),
  }
}

/** A wire field state → the core's RentenFeldZustand; a 400 when `erfasst` lacks a valid value. */
function zustandAusDto(dto: PutRenteFeldDto): RentenFeldZustand {
  if (dto.kind === 'offen') return { kind: 'offen' }
  if (dto.kind === 'unklar') return { kind: 'unklar' }
  if (dto.wert === undefined || !istGueltigerRentenBetrag(dto.wert)) {
    throw new BadRequestException('kind "erfasst" requires a non-negative integer `wert`.')
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

@Injectable()
export class RenteService {
  constructor(
    @Inject(RENTE_REPOSITORY) private readonly repository: RenteRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepository: InterviewAnswerRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
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
    // Only log an access when there's something to access (REQ-004.2's pattern).
    if (record !== null) {
      await this.auditService.append({ userId, action: 'READ', resource: 'rente' })
    }
    return this.toResponse(userId, steuerjahr, record)
  }

  async setFeld(userId: string, steuerjahr: number, feld: RentenFeldId, dto: PutRenteFeldDto): Promise<RenteResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, steuerjahr)
    const daten = datenAusRecord(record)
    const zustand = zustandAusDto(dto)
    // `setzeRentenFeld` is the core's own invariant guard (throws on an invalid `erfasst`) —
    // defense in depth behind the explicit 400 in `zustandAusDto`.
    setzeRentenFeld(daten, feld, zustand)
    const next = await this.repository.setFeld(userId, steuerjahr, feld, serialisiereRentenFeld(zustand))
    return this.toResponse(userId, steuerjahr, next)
  }

  async setRentenart(userId: string, steuerjahr: number, dto: PutRentenartDto): Promise<RenteResponseDto> {
    const art = dto.art ?? null
    if (art !== null && !isRentenart(art)) {
      throw new BadRequestException('art must be one of the five Rentenarten, or null.')
    }
    const record = await this.repository.setRentenart(userId, steuerjahr, art)
    return this.toResponse(userId, steuerjahr, record)
  }
}
