import { Inject, Injectable } from '@nestjs/common'
import { InvalidInputError, NotFoundError } from '../common/domain-error.js'
import {
  deserializeRentalField,
  gatedIncomeTypes,
  isValidRentalAmount,
  classifyRental,
  serializeRentalField,
  setRentalField,
  vermietungsobjektFakten,
  vermietungStand,
  type Answers,
  type RentalFieldId,
  type RentalFieldState,
  provenanceKey,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { PROVENANCE_REPOSITORY, type ProvenanceRepository } from '../kennzeichnung/kennzeichnung.repository.js'
import {
  INTERVIEW_ANSWER_REPOSITORY,
  type InterviewAnswerRepository,
} from '../interview/interview-answer.repository.js'
import { RENTAL_REPOSITORY, type RentalObjectRecord, type RentalRepository } from './vermietung.repository.js'
import type { PutVermietungFeldDto, VermietungFeldDto } from './dto/vermietung-feld.dto.js'
import type { PutVermietungAdresseDto } from './dto/vermietung-adresse.dto.js'
import type {
  VermietungEinordnungDto,
  VermietungsobjektDto,
  VermietungsobjektFaktenDto,
  VermietungResponseDto,
  VermietungStandDto,
} from './dto/vermietung-response.dto.js'
import { answersAus } from '../interview/answers.js'

function datenAusRecord(record: RentalObjectRecord) {
  return {
    id: record.id,
    mieteinnahmen: deserializeRentalField(record.mieteinnahmen),
    anschaffungskosten: deserializeRentalField(record.anschaffungskosten),
    baujahr: deserializeRentalField(record.baujahr),
    werbungskosten: deserializeRentalField(record.werbungskosten),
  }
}

function zustandAusDto(dto: PutVermietungFeldDto): RentalFieldState {
  if (dto.kind === 'offen') return { kind: 'offen' }
  if (dto.kind === 'unklar') return { kind: 'unklar' }
  if (dto.wert === undefined || !isValidRentalAmount(dto.wert)) {
    throw new InvalidInputError('FIELD_VALUE_INVALID', 'kind "erfasst" requires a non-negative integer `wert`.')
  }
  return { kind: 'erfasst', wert: dto.wert }
}

function toFeldDto(zustand: RentalFieldState): VermietungFeldDto {
  switch (zustand.kind) {
    case 'offen':
      return { kind: 'offen' }
    case 'unklar':
      return { kind: 'unklar' }
    case 'erfasst':
      return { kind: 'erfasst', wert: zustand.wert }
  }
}

function objektZuDto(record: RentalObjectRecord): VermietungsobjektDto {
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
    strasse: record.strasse ?? null,
    hausnummer: record.hausnummer ?? null,
    plz: record.plz ?? null,
    ort: record.ort ?? null,
    wohnflaeche: record.wohnflaeche ?? null,
    afaWieVorjahr: record.afaWieVorjahr ?? null,
    umlagen: record.umlagen ?? null,
    schuldzinsen: record.schuldzinsen ?? null,
    einheiten: record.einheiten ?? null,
    anteilA: record.anteilA ?? null,
    fakten: faktenDto,
  }
}

/** Application logic for the Vermietung guided mask + fold. */
@Injectable()
export class VermietungService {
  constructor(
    @Inject(RENTAL_REPOSITORY) private readonly repository: RentalRepository,
    @Inject(INTERVIEW_ANSWER_REPOSITORY) private readonly interviewRepository: InterviewAnswerRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PROVENANCE_REPOSITORY) private readonly kennzeichnungen: ProvenanceRepository,
  ) {}

  private async antworten(userId: string, steuerjahr: number): Promise<Answers> {
    const rows = await this.interviewRepository.findAllForUserAndYear(userId, steuerjahr)
    return answersAus(rows)
  }

  private async toResponse(userId: string, steuerjahr: number, records: RentalObjectRecord[]): Promise<VermietungResponseDto> {
    const answers = await this.antworten(userId, steuerjahr)
    const gegated = gatedIncomeTypes(answers)
    const einordnung: VermietungEinordnungDto = classifyRental(answers['vermietung-art'])

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

  async setFeld(userId: string, steuerjahr: number, objektId: string, feld: RentalFieldId, dto: PutVermietungFeldDto): Promise<VermietungResponseDto> {
    const zustand = zustandAusDto(dto)
    const record = await this.repository.setFeld(userId, steuerjahr, objektId, feld, serializeRentalField(zustand))
    if (record === null) {
      throw new NotFoundError('VERMIETUNGSOBJEKT_NOT_FOUND', 'No such Vermietungsobjekt for this account and tax year.')
    }
    await this.kennzeichnungen.entferne(userId, steuerjahr, [provenanceKey('vermietung', feld, objektId)])
    const daten = datenAusRecord(record)
    setRentalField(daten, feld, zustand)
    const records = await this.repository.listForUserAndYear(userId, steuerjahr)
    return this.toResponse(userId, steuerjahr, records)
  }

  async setAdresse(
    userId: string,
    steuerjahr: number,
    objektId: string,
    dto: PutVermietungAdresseDto,
  ): Promise<VermietungResponseDto> {
    const record = await this.repository.setAdresse(userId, steuerjahr, objektId, dto)
    if (record === null) {
      throw new NotFoundError('VERMIETUNGSOBJEKT_NOT_FOUND', 'No such Vermietungsobjekt for this account and tax year.')
    }
    const records = await this.repository.listForUserAndYear(userId, steuerjahr)
    return this.toResponse(userId, steuerjahr, records)
  }
}
