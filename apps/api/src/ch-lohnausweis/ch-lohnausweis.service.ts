// Application logic for the CH-Lohnausweis guided mask + fold (ADR-036/029, Grenzgänger-CH
// vertical, ticket 16). userId+steuerjahr-scoped read/write, then the honest-state + fold mapping.
// Trusts that `userId` was produced by UserContextGuard + @RequiresAccount() (never accepts it
// from a param/body) — mirrors LstbService/InterviewService. The fold is NEVER computed here —
// @steuereule/core's `grenzgaengerStand`/`grenzgaengerChPosten`/`chPostenAlsKernposten` are
// imported, never reimplemented (ADR-014/048 determinism boundary). The Grenzgänger-Status and the
// gated Einkunftsarten are derived from the stored interview answers via the interview repository
// (the one read path), never trusted from the client.
import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import {
  LOHNAUSWEIS_FELDER,
  amtlicherMonatskurs,
  chPostenAlsKernposten,
  deserialisiereLohnausweisFeld,
  gatedEinkunftsarten,
  grenzgaengerChPosten,
  grenzgaengerStand,
  grenzgaengerStatus,
  istGueltigerLohnausweisBetrag,
  serialisiereLohnausweisFeld,
  tatsaechlicherKurs,
  type Answers,
  type Berechnungsstand,
  type ChPosten,
  type GrenzgaengerStatus,
  type LohnausweisWerte,
  type Wechselkurs,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import {
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRepository,
} from '../interview/interview-answer.repository.js'
import {
  CH_LOHNAUSWEIS_REPOSITORY,
  type ChLohnausweisRecord,
  type ChLohnausweisRepository,
} from './ch-lohnausweis.repository.js'
import type { LohnausweisFeldDto, PutLohnausweisFeldDto } from './dto/lohnausweis-feld.dto.js'
import type { PutWechselkursDto, WechselkursDto } from './dto/wechselkurs.dto.js'
import type { ChPostenDto, PutBemerkungenDto, PutVorsorgeDto } from './dto/ch-posten.dto.js'
import type { BerechnungsstandDto, ChLohnausweisResponseDto } from './dto/ch-lohnausweis-response.dto.js'

/** A stored row's 14 field strings → the wire field states + the fold's sparse `LohnausweisWerte`. */
function felderAusRecord(record: ChLohnausweisRecord | null): { felder: LohnausweisFeldDto[]; werte: LohnausweisWerte } {
  const felder: LohnausweisFeldDto[] = []
  const werte: LohnausweisWerte = {}
  for (const feld of LOHNAUSWEIS_FELDER) {
    if (feld.art !== 'chf-betrag') continue
    const stored = record === null ? null : record.felder[feld.id as keyof ChLohnausweisRecord['felder']]
    const wert = deserialisiereLohnausweisFeld(stored)
    if (wert === null) {
      felder.push({ id: feld.id, ziffer: feld.ziffer, kind: 'offen' })
    } else if (wert === 'unklar') {
      felder.push({ id: feld.id, ziffer: feld.ziffer, kind: 'unklar' })
    } else {
      felder.push({ id: feld.id, ziffer: feld.ziffer, kind: 'erfasst', wert })
      werte[feld.id] = wert
    }
  }
  return { felder, werte }
}

function wechselkursAusRecord(record: ChLohnausweisRecord | null): Wechselkurs | null {
  if (record === null || record.wechselkursMonat === null || record.wechselkursKurs === null || record.wechselkursModus === null) {
    return null
  }
  if (record.wechselkursModus === 'amtlich') return amtlicherMonatskurs(record.wechselkursMonat, record.wechselkursKurs)
  if (record.wechselkursBelegId === null) {
    // A persisted tatsächlicher Kurs without a Beleg violates ADR-012 — report it as not-foldable
    // rather than fabricating an amtliche fallback (honesty: the core factory refuses to build it).
    return null
  }
  return tatsaechlicherKurs(record.wechselkursMonat, record.wechselkursKurs, record.wechselkursBelegId)
}

function wechselkursZuDto(kurs: Wechselkurs): WechselkursDto {
  return { monat: kurs.monat, kurs: kurs.kurs, modus: kurs.modus, ...(kurs.belegId !== undefined ? { belegId: kurs.belegId } : {}) }
}

function standZuDto(stand: Berechnungsstand): BerechnungsstandDto {
  if (stand.kind === 'bestimmt') {
    return { kind: 'bestimmt', einnahmen: stand.einnahmen, vorsorgeaufwand: stand.vorsorgeaufwand, anrechnung: stand.anrechnung }
  }
  return {
    kind: 'offen',
    einnahmen: stand.einnahmen,
    vorsorgeaufwand: stand.vorsorgeaufwand,
    anrechnung: stand.anrechnung,
    offenePosten: stand.offenePosten,
    konflikte: stand.konflikte,
    gegated: [...stand.gegated],
  }
}

function postenZuDto(posten: ChPosten): ChPostenDto {
  const kern = chPostenAlsKernposten(posten)
  return {
    id: posten.id,
    art: posten.art,
    ...(posten.ziffer !== undefined ? { ziffer: posten.ziffer } : {}),
    betragChf: posten.betragChf,
    betragEur: posten.betragEur,
    rolle: kern?.rolle ?? 'einnahme',
    wechselkurs: wechselkursZuDto(posten.wechselkurs),
  }
}

/** The wire field state → the core's stored encoding; a 400 when `erfasst` lacks a valid amount. */
function wertAusDto(dto: PutLohnausweisFeldDto): string | null {
  if (dto.kind === 'offen') return null
  if (dto.kind === 'unklar') return 'unklar'
  if (dto.wert === undefined || !istGueltigerLohnausweisBetrag(dto.wert)) {
    throw new BadRequestException('kind "erfasst" requires a non-negative whole-CHF `wert`.')
  }
  return serialisiereLohnausweisFeld(dto.wert)
}

function statusAusAnswers(answers: Answers): GrenzgaengerStatus | null {
  const wohnsitz = answers['ch-wohnsitz']
  if (wohnsitz !== 'Deutschland' && wohnsitz !== 'Schweiz') return null
  const tageStr = answers['ch-nichtrueckkehrtage']
  if (tageStr === undefined) return null
  const tage = Number(tageStr)
  if (!Number.isInteger(tage)) return null
  return grenzgaengerStatus(wohnsitz, tage)
}

@Injectable()
export class ChLohnausweisService {
  constructor(
    @Inject(CH_LOHNAUSWEIS_REPOSITORY) private readonly repository: ChLohnausweisRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepository: InterviewAnswerRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  private async antworten(userId: string, steuerjahr: number): Promise<Answers> {
    const rows = await this.interviewRepository.findAllForUserAndYear(userId, steuerjahr)
    const answers: Record<string, string> = {}
    for (const row of rows) answers[row.questionId] = row.value
    return answers as Answers
  }

  private async toResponse(userId: string, steuerjahr: number, record: ChLohnausweisRecord | null): Promise<ChLohnausweisResponseDto> {
    const { felder, werte } = felderAusRecord(record)
    const wechselkurs = wechselkursAusRecord(record)
    const answers = await this.antworten(userId, steuerjahr)
    const status = statusAusAnswers(answers)
    const gegated = gatedEinkunftsarten(answers)

    const saeule3aChf = record === null || record.saeule3aChf === null ? undefined : Number(record.saeule3aChf)
    const krankenkasseChf = record === null || record.krankenkasseChf === null ? undefined : Number(record.krankenkasseChf)

    // The fold only exists once both the Kurs and the status are known; before that the line
    // items are honestly empty and `stand` is null (nothing to fold — never a fabricated zero).
    let posten: ChPostenDto[] = []
    let stand: BerechnungsstandDto | null = null
    if (wechselkurs !== null && status !== null) {
      const chPosten = grenzgaengerChPosten({
        lohnausweis: werte,
        ...(saeule3aChf !== undefined ? { saeule3aChf } : {}),
        ...(krankenkasseChf !== undefined ? { krankenkasseChf } : {}),
        wechselkurs,
      })
      posten = chPosten.map(postenZuDto)
      stand = standZuDto(
        grenzgaengerStand({
          lohnausweis: werte,
          ...(saeule3aChf !== undefined ? { saeule3aChf } : {}),
          ...(krankenkasseChf !== undefined ? { krankenkasseChf } : {}),
          status,
          wechselkurs,
          gegated,
        }),
      )
    }

    return {
      felder,
      bemerkungen: record?.bemerkungen ?? null,
      wechselkurs: wechselkurs === null ? null : wechselkursZuDto(wechselkurs),
      status,
      posten,
      stand,
    }
  }

  async getState(userId: string, steuerjahr: number): Promise<ChLohnausweisResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, steuerjahr)
    // Only log an access when there's something to access (REQ-004.2's pattern) — a GET on a
    // fresh tax year with no mask started yet appends no READ entry.
    if (record !== null) {
      await this.auditService.append({ userId, action: 'READ', resource: 'ch-lohnausweis' })
    }
    return this.toResponse(userId, steuerjahr, record)
  }

  async setFeld(
    userId: string,
    steuerjahr: number,
    feld: Parameters<ChLohnausweisRepository['setFeld']>[2],
    dto: PutLohnausweisFeldDto,
  ): Promise<ChLohnausweisResponseDto> {
    const record = await this.repository.setFeld(userId, steuerjahr, feld, wertAusDto(dto))
    return this.toResponse(userId, steuerjahr, record)
  }

  async setBemerkungen(userId: string, steuerjahr: number, dto: PutBemerkungenDto): Promise<ChLohnausweisResponseDto> {
    const record = await this.repository.setBemerkungen(userId, steuerjahr, dto.text ?? null)
    return this.toResponse(userId, steuerjahr, record)
  }

  async setVorsorge(userId: string, steuerjahr: number, dto: PutVorsorgeDto): Promise<ChLohnausweisResponseDto> {
    const saeule3aChf = this.serialisiereOptional(dto.saeule3aChf)
    const krankenkasseChf = this.serialisiereOptional(dto.krankenkasseChf)
    const record = await this.repository.setVorsorge(userId, steuerjahr, saeule3aChf, krankenkasseChf)
    return this.toResponse(userId, steuerjahr, record)
  }

  async setWechselkurs(userId: string, steuerjahr: number, dto: PutWechselkursDto): Promise<ChLohnausweisResponseDto> {
    // Build through the core factory so "tatsächlich ohne Beleg" and an invalid Kurs are rejected
    // (ADR-012) — never a silent amtliche fallback. The core throws RangeError; translate to a 400
    // at the boundary (a client mistake), not a 500.
    let kurs: Wechselkurs
    try {
      kurs =
        dto.modus === 'amtlich'
          ? amtlicherMonatskurs(dto.monat, dto.kurs)
          : tatsaechlicherKurs(dto.monat, dto.kurs, dto.belegId ?? '')
    } catch (error) {
      if (error instanceof RangeError) {
        throw new BadRequestException(error.message)
      }
      throw error
    }
    const record = await this.repository.setWechselkurs(userId, steuerjahr, {
      monat: kurs.monat,
      kurs: kurs.kurs,
      modus: kurs.modus,
      ...(kurs.belegId !== undefined ? { belegId: kurs.belegId } : {}),
    })
    return this.toResponse(userId, steuerjahr, record)
  }

  /** A nullable optional amount → its stored string (null stays null; a value must be valid). */
  private serialisiereOptional(wert: number | null | undefined): string | null {
    if (wert === null || wert === undefined) return null
    if (!istGueltigerLohnausweisBetrag(wert)) {
      throw new BadRequestException('a whole-CHF amount must be a non-negative integer.')
    }
    return String(wert)
  }
}
