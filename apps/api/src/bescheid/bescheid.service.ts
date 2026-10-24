// Application logic for the Steuerbescheid (Bescheidprüfung 1.0, ticket 10.3, ADR-009):
// userId+steuerjahr-scoped read/write, the honest field-state + Abgleich + Frist mapping, and the
// server-validated phase transitions. Trusts that `userId` was produced by UserContextGuard +
// @RequiresAccount() (never accepts it from a param/body). The Abgleich, the Frist and the
// transitions are NEVER computed here — @steuereule/core's `gleicheBescheidAb`,
// `bescheidBerechnungsstand`, `einspruchsfristEnde`/`verbleibendeEinspruchstage` and
// `istBescheidUebergangErlaubt` are imported, never reimplemented (ADR-014/048 determinism
// boundary). The "berechnet" side is folded from the SAME repositories the Cockpit and the CH
// services read (LStB + interview + CH-Lohnausweis), never a second calc path.
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common'
import {
  BESCHEID_FELDER,
  amtlicherMonatskurs,
  angestellteAusDaten,
  bescheidBerechnungsstand,
  deserialisiereBescheidFeld,
  deserialisiereLohnausweisFeld,
  deserialisiereLstbFeld,
  einspruchsfristEnde,
  gatedEinkunftsarten,
  gleicheBescheidAb,
  grenzgaengerStand,
  grenzgaengerStatus,
  istBescheidUebergangErlaubt,
  istEinspruchGrund,
  istGueltigerBescheidBetrag,
  naechsteBescheidZustaende,
  serialisiereBescheidFeld,
  tatsaechlicherKurs,
  verbleibendeEinspruchstage,
  type Answers,
  type Berechnungsstand,
  type BescheidStatus,
  type BescheidWerte,
  type GrenzgaengerStatus,
  type LohnausweisWerte,
  type Wechselkurs,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import {
  CH_LOHNAUSWEIS_REPOSITORY,
  type ChLohnausweisRecord,
  type ChLohnausweisRepository,
} from '../ch-lohnausweis/ch-lohnausweis.repository.js'
import {
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRepository,
} from '../interview/interview-answer.repository.js'
import { LSTB_REPOSITORY, type LstbRepository } from '../lstb/lstb.repository.js'
import { BESCHEID_REPOSITORY, type BescheidRecord, type BescheidRepository } from './bescheid.repository.js'
import type { BescheidFeldDto, PutBescheidFeldDto } from './dto/bescheid-feld.dto.js'
import type {
  BescheidAbweichungDto,
  BescheidResponseDto,
  SetBescheidDatumDto,
  SetBescheidStatusDto,
  SetEinspruchDto,
} from './dto/bescheid-response.dto.js'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** The stored strings → the wire field states + the sparse comparable `BescheidWerte`. */
function felderAusRecord(record: BescheidRecord | null): { felder: BescheidFeldDto[]; werte: BescheidWerte } {
  const felder: BescheidFeldDto[] = []
  const werte: BescheidWerte = {}
  for (const feld of BESCHEID_FELDER) {
    const stored = record === null ? null : record.felder[feld.id]
    const wert = deserialisiereBescheidFeld(feld.id, stored)
    if (wert === null) {
      felder.push({ id: feld.id, kind: 'offen' })
    } else if (wert === 'unklar') {
      felder.push({ id: feld.id, kind: 'unklar' })
    } else {
      felder.push({ id: feld.id, kind: 'erfasst', wert })
      werte[feld.id] = wert
    }
  }
  return { felder, werte }
}

function toAnswers(rows: readonly { questionId: string; value: string }[]): Answers {
  const answers: Record<string, string> = {}
  for (const row of rows) answers[row.questionId] = row.value
  return answers as Answers
}

// --- Grenzgänger-CH fold — mirrors ChLohnausweisService's private derivation (read-only). ----

function wechselkursAusRecord(record: ChLohnausweisRecord | null): Wechselkurs | null {
  if (record === null || record.wechselkursMonat === null || record.wechselkursKurs === null || record.wechselkursModus === null) {
    return null
  }
  if (record.wechselkursModus === 'amtlich') return amtlicherMonatskurs(record.wechselkursMonat, record.wechselkursKurs)
  if (record.wechselkursBelegId === null) return null // persisted tatsächlich without a Beleg (ADR-012) — not foldable
  return tatsaechlicherKurs(record.wechselkursMonat, record.wechselkursKurs, record.wechselkursBelegId)
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

function lohnausweisWerteAusRecord(record: ChLohnausweisRecord | null): LohnausweisWerte {
  const werte: LohnausweisWerte = {}
  if (record === null) return werte
  for (const [feldId, stored] of Object.entries(record.felder)) {
    const wert = deserialisiereLohnausweisFeld(stored)
    if (typeof wert === 'number') werte[feldId as keyof LohnausweisWerte] = wert
  }
  return werte
}

@Injectable()
export class BescheidService {
  constructor(
    @Inject(BESCHEID_REPOSITORY) private readonly repository: BescheidRepository,
    @Inject(LSTB_REPOSITORY) private readonly lstbRepository: LstbRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepository: InterviewAnswerRepository,
    @Inject(CH_LOHNAUSWEIS_REPOSITORY) private readonly chLohnausweisRepository: ChLohnausweisRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  /** The computed "berechnet" side: the merged Angestellte + CH fold, via the core. */
  private async berechnungsstand(userId: string, steuerjahr: number): Promise<Berechnungsstand> {
    const [lstbRecord, interviewRows, chRecord] = await Promise.all([
      this.lstbRepository.findForUserAndYear(userId, steuerjahr),
      this.interviewRepository.findAllForUserAndYear(userId, steuerjahr),
      this.chLohnausweisRepository.findForUserAndYear(userId, steuerjahr),
    ])
    const answers = toAnswers(interviewRows)

    const angestellte = angestellteAusDaten(
      {
        bruttoarbeitslohn: deserialisiereLstbFeld(lstbRecord?.bruttoarbeitslohn ?? null),
        lohnsteuer: deserialisiereLstbFeld(lstbRecord?.lohnsteuer ?? null),
        sozialversicherung: deserialisiereLstbFeld(lstbRecord?.sozialversicherung ?? null),
      },
      answers,
    )

    const wechselkurs = wechselkursAusRecord(chRecord)
    const status = statusAusAnswers(answers)
    const saeule3aChf = chRecord === null || chRecord.saeule3aChf === null ? undefined : Number(chRecord.saeule3aChf)
    const krankenkasseChf = chRecord === null || chRecord.krankenkasseChf === null ? undefined : Number(chRecord.krankenkasseChf)

    // The CH fold only exists once both the Kurs and the status are known; before that there is
    // no CH side to merge (nothing to fold — never a fabricated zero).
    let ch: Berechnungsstand | null = null
    if (wechselkurs !== null && status !== null) {
      ch = grenzgaengerStand({
        lohnausweis: lohnausweisWerteAusRecord(chRecord),
        ...(saeule3aChf !== undefined ? { saeule3aChf } : {}),
        ...(krankenkasseChf !== undefined ? { krankenkasseChf } : {}),
        status,
        wechselkurs,
        gegated: gatedEinkunftsarten(answers),
      })
    }

    return bescheidBerechnungsstand(angestellte, ch)
  }

  private async toResponse(userId: string, steuerjahr: number, record: BescheidRecord | null): Promise<BescheidResponseDto> {
    const { felder, werte } = felderAusRecord(record)
    const status: BescheidStatus = record?.status ?? 'eingegangen'
    const bescheiddatum = record?.bescheiddatum ?? null
    const einspruchGrund = record?.einspruchGrund ?? null

    const stand = await this.berechnungsstand(userId, steuerjahr)
    const abgleich = gleicheBescheidAb(werte, stand)

    const fristEnde = bescheiddatum === null ? null : einspruchsfristEnde(bescheiddatum)
    const verbleibendeTage =
      fristEnde === null ? null : verbleibendeEinspruchstage(bescheiddatum as string, heuteIso())

    return {
      status,
      bescheiddatum,
      einspruchGrund,
      felder,
      abgleich: {
        abweichungen: abgleich.abweichungen.map((a): BescheidAbweichungDto => ({ ...a })),
        berechnungUnvollstaendig: abgleich.berechnungUnvollstaendig,
      },
      frist: { bescheiddatum, fristEnde, verbleibendeTage },
      naechsteZustaende: [...naechsteBescheidZustaende(status)],
    }
  }

  async getState(userId: string, steuerjahr: number): Promise<BescheidResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, steuerjahr)
    // Only log an access when there's something to access (REQ-004.2's pattern).
    if (record !== null) {
      await this.auditService.append({ userId, action: 'READ', resource: 'bescheid' })
    }
    return this.toResponse(userId, steuerjahr, record)
  }

  async setFeld(
    userId: string,
    steuerjahr: number,
    feld: Parameters<BescheidRepository['setFeld']>[2],
    dto: PutBescheidFeldDto,
  ): Promise<BescheidResponseDto> {
    const record = await this.repository.setFeld(userId, steuerjahr, feld, wertAusDto(feld, dto))
    return this.toResponse(userId, steuerjahr, record)
  }

  async setDatum(userId: string, steuerjahr: number, dto: SetBescheidDatumDto): Promise<BescheidResponseDto> {
    if (dto.datum !== null && dto.datum !== undefined && !ISO_DATE_RE.test(dto.datum)) {
      throw new BadRequestException('bescheiddatum must be an ISO yyyy-mm-dd date')
    }
    const record = await this.repository.setDatum(userId, steuerjahr, dto.datum ?? null)
    return this.toResponse(userId, steuerjahr, record)
  }

  async setStatus(userId: string, steuerjahr: number, dto: SetBescheidStatusDto): Promise<BescheidResponseDto> {
    const current = await this.repository.findForUserAndYear(userId, steuerjahr)
    const von: BescheidStatus = current?.status ?? 'eingegangen'
    const nach = dto.status as BescheidStatus
    if (!istBescheidUebergangErlaubt(von, nach)) {
      // ADR-021/0039: an illegal transition is rejected, never silently coerced — the client
      // must only offer `naechsteZustaende`, and a forged write is a 409 conflict.
      throw new ConflictException(`illegal Bescheid transition "${von}" → "${nach}"`)
    }
    const record = await this.repository.setStatus(userId, steuerjahr, nach)
    return this.toResponse(userId, steuerjahr, record)
  }

  async setEinspruch(userId: string, steuerjahr: number, dto: SetEinspruchDto): Promise<BescheidResponseDto> {
    if (!istEinspruchGrund(dto.grund)) {
      throw new BadRequestException(`unknown Einspruch-Grund "${dto.grund}"`)
    }
    const current = await this.repository.findForUserAndYear(userId, steuerjahr)
    const von: BescheidStatus = current?.status ?? 'eingegangen'
    if (!istBescheidUebergangErlaubt(von, 'einspruch-eingelegt')) {
      throw new ConflictException(`illegal Bescheid transition "${von}" → "einspruch-eingelegt"`)
    }
    const record = await this.repository.setEinspruch(userId, steuerjahr, dto.grund)
    return this.toResponse(userId, steuerjahr, record)
  }
}

/** The wire field state → the core's stored encoding; a 400 when `erfasst` lacks a valid amount. */
function wertAusDto(feld: Parameters<BescheidRepository['setFeld']>[2], dto: PutBescheidFeldDto): string | null {
  if (dto.kind === 'offen') return null
  if (dto.kind === 'unklar') return 'unklar'
  if (dto.wert === undefined || !istGueltigerBescheidBetrag(feld, dto.wert)) {
    throw new BadRequestException(`kind "erfasst" requires a valid whole-euro \`wert\` for "${feld}".`)
  }
  return serialisiereBescheidFeld(feld, dto.wert)
}

/** Today's ISO yyyy-mm-dd (UTC) — the Fristen-Countdown's reference point, recomputed per read. */
function heuteIso(): string {
  return new Date().toISOString().slice(0, 10)
}
