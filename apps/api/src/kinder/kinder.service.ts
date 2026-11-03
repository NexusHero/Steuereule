import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { istGueltigesKindGeburtsdatum, kinderStand, type KindDaten } from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { KIND_REPOSITORY, type KindRecord, type KindRepository } from './kind.repository.js'
import type { CreateKindDto, KinderResponseDto, KindResponseDto, UpdateKindDto } from './dto/kind.dto.js'

function toKindDaten(r: KindRecord): KindDaten {
  return {
    id: r.id,
    vorname: r.vorname,
    nachname: r.nachname,
    geburtsdatum: r.geburtsdatum,
    steuerId: r.idnr,
    kindergeld: r.kindergeldAnspruchEur ? Number(r.kindergeldAnspruchEur) : null,
  }
}

function toDto(r: KindRecord): KindResponseDto {
  return {
    id: r.id,
    lfdNr: r.lfdNr,
    vorname: r.vorname,
    nachname: r.nachname,
    geburtsdatum: r.geburtsdatum,
    idnr: r.idnr,
    kindergeldAnspruchEur: r.kindergeldAnspruchEur,
    kindschaftsverhaeltnis: r.kindschaftsverhaeltnis,
    kindschaftsverhaeltnisB: r.kindschaftsverhaeltnisB,
    familienkasse: r.familienkasse,
    wohnsitzInlandGanzjaehrig: r.wohnsitzInlandGanzjaehrig,
    andererElternteil: r.andererElternteil,
    andererElternteilName: r.andererElternteilName,
    andererElternteilGeburtsdatum: r.andererElternteilGeburtsdatum,
    andererElternteilAdresse: r.andererElternteilAdresse,
    andererElternteilArt: r.andererElternteilArt,
    andererElternteilVerstorbenAm: r.andererElternteilVerstorbenAm,
  }
}

@Injectable()
export class KinderService {
  constructor(
    @Inject(KIND_REPOSITORY) private readonly repository: KindRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  private toResponse(records: KindRecord[], jahr: number): KinderResponseDto {
    const daten = records.map(toKindDaten)
    const stand = kinderStand(daten, jahr)
    return {
      kinder: records.map(toDto),
      anzahl: stand.anzahl,
      kindergeldSumme: stand.kindergeldSumme,
      freibetragGesamt: stand.freibetragGesamt,
    }
  }

  async list(userId: string, steuerjahr: number): Promise<KinderResponseDto> {
    const records = await this.repository.listForUserAndYear(userId, steuerjahr)
    if (records.length > 0) {
      await this.auditService.append({ userId, action: 'READ', resource: 'kind' })
    }
    return this.toResponse(records, steuerjahr)
  }

  async create(userId: string, steuerjahr: number, dto: CreateKindDto): Promise<KinderResponseDto> {
    if (!istGueltigesKindGeburtsdatum(dto.geburtsdatum, steuerjahr)) {
      throw new BadRequestException('Ungültiges Geburtsdatum für dieses Steuerjahr.')
    }
    await this.repository.create(userId, steuerjahr, dto)
    const records = await this.repository.listForUserAndYear(userId, steuerjahr)
    return this.toResponse(records, steuerjahr)
  }

  async update(userId: string, steuerjahr: number, id: string, dto: UpdateKindDto): Promise<KinderResponseDto> {
    if (dto.geburtsdatum && !istGueltigesKindGeburtsdatum(dto.geburtsdatum, steuerjahr)) {
      throw new BadRequestException('Ungültiges Geburtsdatum für dieses Steuerjahr.')
    }
    const updated = await this.repository.update(userId, steuerjahr, id, dto)
    if (!updated) {
      throw new NotFoundException(`Kind ${id} nicht gefunden.`)
    }
    const records = await this.repository.listForUserAndYear(userId, steuerjahr)
    return this.toResponse(records, steuerjahr)
  }

  async delete(userId: string, steuerjahr: number, id: string): Promise<KinderResponseDto> {
    const deleted = await this.repository.delete(userId, steuerjahr, id)
    if (!deleted) {
      throw new NotFoundException(`Kind ${id} nicht gefunden.`)
    }
    const records = await this.repository.listForUserAndYear(userId, steuerjahr)
    return this.toResponse(records, steuerjahr)
  }
}
