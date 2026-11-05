import { Inject, Injectable } from '@nestjs/common'
import { InvalidInputError } from '../common/domain-error.js'
import {
  LOHNAUSWEIS_FELDER,
  amtlicherMonatskurs,
  chPostenAlsKernposten,
  deserialisiereLohnausweisFeld,
  gatedEinkunftsarten,
  grenzgaengerChPosten,
  grenzgaengerStand,
  istGueltigerLohnausweisBetrag,
  serialisiereLohnausweisFeld,
  tatsaechlicherKurs,
  type Answers,
  type Berechnungsstand,
  type ChPosten,
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
  LEERE_N_GRE,
  type ChLohnausweisRecord,
  type ChLohnausweisRepository,
  type NGreAngaben,
} from './ch-lohnausweis.repository.js'
import type { LohnausweisFeldDto, PutLohnausweisFeldDto } from './dto/lohnausweis-feld.dto.js'
import type { PutWechselkursDto, WechselkursDto } from './dto/wechselkurs.dto.js'
import type { ChPostenDto, NGreAngabenDto, PutBemerkungenDto, PutNGreDto, PutVorsorgeDto } from './dto/ch-posten.dto.js'
import type { BerechnungsstandDto, ChLohnausweisResponseDto } from './dto/ch-lohnausweis-response.dto.js'
import { grenzgaengerStatusAusAnswers, wechselkursAusRecord } from './lohnausweis-daten.js'

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

function wertAusDto(dto: PutLohnausweisFeldDto): string | null {
  if (dto.kind === 'offen') return null
  if (dto.kind === 'unklar') return 'unklar'
  if (dto.wert === undefined || !istGueltigerLohnausweisBetrag(dto.wert)) {
    throw new InvalidInputError('FIELD_VALUE_INVALID', 'kind "erfasst" requires a non-negative whole-CHF `wert`.')
  }
  return serialisiereLohnausweisFeld(dto.wert)
}


function nGreZuDto(n: NGreAngaben): NGreAngabenDto {
  const zahl = (wert: string | null): number | null => (wert === null ? null : Number(wert))
  return {
    arbeitgeberName: n.arbeitgeberName,
    arbeitgeberStrasse: n.arbeitgeberStrasse,
    arbeitgeberPlzOrt: n.arbeitgeberPlzOrt,
    familienzulagenChf: zahl(n.familienzulagenChf),
    krankentaggeldChf: zahl(n.krankentaggeldChf),
    pkArbeitnehmerChf: zahl(n.pkArbeitnehmerChf),
    pkArbeitgeberChf: zahl(n.pkArbeitgeberChf),
    krankentaggeldArbeitgeberProzent: zahl(n.krankentaggeldArbeitgeberProzent),
    krankentaggeldArbeitgeberChf: zahl(n.krankentaggeldArbeitgeberChf),
    nbuvArbeitgeberProzent: zahl(n.nbuvArbeitgeberProzent),
    nbuvArbeitgeberChf: zahl(n.nbuvArbeitgeberChf),
    sonderfaelle: n.nGreSonderfaelle,
  }
}

/** Application logic for the CH-Lohnausweis guided mask + fold. */
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
    const status = grenzgaengerStatusAusAnswers(answers)
    const gegated = gatedEinkunftsarten(answers)

    const saeule3aChf = record === null || record.saeule3aChf === null ? undefined : Number(record.saeule3aChf)
    const krankenkasseChf = record === null || record.krankenkasseChf === null ? undefined : Number(record.krankenkasseChf)

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
      nGre: nGreZuDto(record?.nGre ?? LEERE_N_GRE),
    }
  }

  async getState(userId: string, steuerjahr: number): Promise<ChLohnausweisResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, steuerjahr)
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

  async setNGre(userId: string, steuerjahr: number, dto: PutNGreDto): Promise<ChLohnausweisResponseDto> {
    const { sonderfaelle, ...rest } = dto
    const angaben: Partial<NGreAngaben> = {}
    for (const [feld, wert] of Object.entries(rest)) {
      if (wert === undefined) continue
      angaben[feld as Exclude<keyof NGreAngaben, 'nGreSonderfaelle'>] = wert === null ? null : String(wert)
    }
    if (sonderfaelle !== undefined) angaben.nGreSonderfaelle = sonderfaelle
    const record = await this.repository.setNGre(userId, steuerjahr, angaben)
    return this.toResponse(userId, steuerjahr, record)
  }

  async setWechselkurs(userId: string, steuerjahr: number, dto: PutWechselkursDto): Promise<ChLohnausweisResponseDto> {
    let kurs: Wechselkurs
    try {
      kurs =
        dto.modus === 'amtlich'
          ? amtlicherMonatskurs(dto.monat, dto.kurs)
          : tatsaechlicherKurs(dto.monat, dto.kurs, dto.belegId ?? '')
    } catch (error) {
      if (error instanceof RangeError) {
        throw new InvalidInputError('WECHSELKURS_INVALID', error.message)
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

  private serialisiereOptional(wert: number | null | undefined): string | null {
    if (wert === null || wert === undefined) return null
    if (!istGueltigerLohnausweisBetrag(wert)) {
      throw new InvalidInputError('FIELD_VALUE_INVALID', 'A whole-CHF amount must be a non-negative integer.')
    }
    return String(wert)
  }
}
