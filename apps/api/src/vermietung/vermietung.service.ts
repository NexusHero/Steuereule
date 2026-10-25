// Application logic for the Vermietung guided mask + fold (ticket 10.6, product ADR-033,
// Anlage V einfach). userId+steuerjahr-scoped read/write, then the honest-state + fold mapping.
// Trusts that `userId` was produced by UserContextGuard + @RequiresAccount() (never accepts it
// from a param/body) — mirrors RenteService. The fold and the per-object facts are NEVER
// computed here — @steuereule/core's `vermietungsobjektFakten`/`vermietungsobjektAlsEinnahmePosten`/
// `vermietungStand` are imported, never reimplemented (ADR-014/048 determinism boundary). The
// Einordnung is derived from the stored interview answer `vermietung-art` via the interview
// repository (the one read path), never trusted from the client; the gated Einkunftsarten come
// from the same answers — a Verkauf/möbliert-Anleger reads OFFEN with the gate named (ADR-033).
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import {
  deserialisiereVermietungFeld,
  gatedEinkunftsarten,
  istGueltigerVermietungBetrag,
  ordneVermietungEin,
  serialisiereVermietungFeld,
  setzeVermietungFeld,
  vermietungsobjektFakten,
  vermietungStand,
  type Answers,
  type VermietungFeldId,
  type VermietungFeldZustand,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import {
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRecord,
  type InterviewAnswerRepository,
} from '../interview/interview-answer.repository.js'
import { VERMIETUNG_REPOSITORY, type VermietungsobjektRecord, type VermietungRepository } from './vermietung.repository.js'
import type { PutVermietungFeldDto, VermietungFeldDto } from './dto/vermietung-feld.dto.js'
import type {
  VermietungEinordnungDto,
  VermietungsobjektDto,
  VermietungsobjektFaktenDto,
  VermietungResponseDto,
  VermietungStandDto,
} from './dto/vermietung-response.dto.js'

/** Stored interview rows → the core's sparse Answers object. */
function toAnswers(rows: InterviewAnswerRecord[]): Answers {
  const answers: Record<string, string> = {}
  for (const row of rows) answers[row.questionId] = row.value
  return answers as Answers
}

/** A stored row → the core's VermietungsobjektDaten, via the ONE encoding in core/vermietung.ts. */
function datenAusRecord(record: VermietungsobjektRecord) {
  return {
    id: record.id,
    mieteinnahmen: deserialisiereVermietungFeld(record.mieteinnahmen),
    anschaffungskosten: deserialisiereVermietungFeld(record.anschaffungskosten),
    baujahr: deserialisiereVermietungFeld(record.baujahr),
    werbungskosten: deserialisiereVermietungFeld(record.werbungskosten),
  }
}

/** A wire field state → the core's VermietungFeldZustand; a 400 when `erfasst` lacks a valid value. */
function zustandAusDto(dto: PutVermietungFeldDto): VermietungFeldZustand {
  if (dto.kind === 'offen') return { kind: 'offen' }
  if (dto.kind === 'unklar') return { kind: 'unklar' }
  if (dto.wert === undefined || !istGueltigerVermietungBetrag(dto.wert)) {
    throw new BadRequestException('kind "erfasst" requires a non-negative integer `wert`.')
  }
  return { kind: 'erfasst', wert: dto.wert }
}

function toFeldDto(zustand: VermietungFeldZustand): VermietungFeldDto {
  switch (zustand.kind) {
    case 'offen':
      return { kind: 'offen' }
    case 'unklar':
      return { kind: 'unklar' }
    case 'erfasst':
      return { kind: 'erfasst', wert: zustand.wert }
  }
}

function objektZuDto(record: VermietungsobjektRecord): VermietungsobjektDto {
  const daten = datenAusRecord(record)
  const fakten = vermietungsobjektFakten(daten)
  const faktenDto: VermietungsobjektFaktenDto = {
    einnahmen: fakten.einnahmen,
    werbungskosten: fakten.werbungskosten,
    afa: fakten.afa,
    offenePosten: fakten.offenePosten,
  }
  return {
    id: daten.id,
    mieteinnahmen: toFeldDto(daten.mieteinnahmen),
    anschaffungskosten: toFeldDto(daten.anschaffungskosten),
    baujahr: toFeldDto(daten.baujahr),
    werbungskosten: toFeldDto(daten.werbungskosten),
    fakten: faktenDto,
  }
}

@Injectable()
export class VermietungService {
  constructor(
    @Inject(VERMIETUNG_REPOSITORY) private readonly repository: VermietungRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepository: InterviewAnswerRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  private async antworten(userId: string, steuerjahr: number): Promise<Answers> {
    const rows = await this.interviewRepository.findAllForUserAndYear(userId, steuerjahr)
    return toAnswers(rows)
  }

  private async toResponse(userId: string, steuerjahr: number, records: VermietungsobjektRecord[]): Promise<VermietungResponseDto> {
    const answers = await this.antworten(userId, steuerjahr)
    const gegated = gatedEinkunftsarten(answers)
    const einordnung: VermietungEinordnungDto = ordneVermietungEin(answers['vermietung-art'])

    const objekte = records.map((record) => datenAusRecord(record))
    const stand = vermietungStand(objekte, gegated)

    const standDto: VermietungStandDto =
      stand.kind === 'bestimmt'
        ? {
            kind: 'bestimmt',
            einnahmen: stand.einnahmen,
            vorsorgeaufwand: stand.vorsorgeaufwand,
            anrechnung: stand.anrechnung,
            werbungskosten: stand.werbungskosten,
            afa: stand.afa,
            offenePosten: stand.offenePosten,
            konflikte: stand.konflikte,
          }
        : {
            kind: 'offen',
            einnahmen: stand.einnahmen,
            vorsorgeaufwand: stand.vorsorgeaufwand,
            anrechnung: stand.anrechnung,
            werbungskosten: stand.werbungskosten,
            afa: stand.afa,
            offenePosten: stand.offenePosten,
            konflikte: stand.konflikte,
            gegated: [...stand.gegated],
          }

    return {
      einordnung,
      objekte: records.map(objektZuDto),
      stand: standDto,
    }
  }

  async getState(userId: string, steuerjahr: number): Promise<VermietungResponseDto> {
    const records = await this.repository.listForUserAndYear(userId, steuerjahr)
    // Only log an access when there's something to access (REQ-004.2's pattern).
    if (records.length > 0) {
      await this.auditService.append({ userId, action: 'READ', resource: 'vermietung' })
    }
    return this.toResponse(userId, steuerjahr, records)
  }

  async createObjekt(userId: string, steuerjahr: number): Promise<VermietungResponseDto> {
    await this.repository.create(userId, steuerjahr)
    const records = await this.repository.listForUserAndYear(userId, steuerjahr)
    return this.toResponse(userId, steuerjahr, records)
  }

  async setFeld(userId: string, steuerjahr: number, objektId: string, feld: VermietungFeldId, dto: PutVermietungFeldDto): Promise<VermietungResponseDto> {
    const zustand = zustandAusDto(dto)
    const record = await this.repository.setFeld(userId, steuerjahr, objektId, feld, serialisiereVermietungFeld(zustand))
    if (record === null) {
      throw new NotFoundException('No such Vermietungsobjekt for this account and tax year.')
    }
    // `setzeVermietungFeld` is the core's own invariant guard (throws on an invalid `erfasst`) —
    // defense in depth behind the explicit 400 in `zustandAusDto`.
    const daten = datenAusRecord(record)
    setzeVermietungFeld(daten, feld, zustand)
    const records = await this.repository.listForUserAndYear(userId, steuerjahr)
    return this.toResponse(userId, steuerjahr, records)
  }
}
