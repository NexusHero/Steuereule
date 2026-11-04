import { Inject, Injectable } from '@nestjs/common'
import { InvalidInputError } from '../common/domain-error.js'
import {
  istGueltigerBetrag,
  lstbZustand,
  serialisiereLstbFeld,
  setzeLstbFeld,
  type LstbDaten,
  type LstbFeldId,
  type LstbFeldZustand,
  type LstbZustand,
  type LstbWiderspruch,
  kennzeichnungsKey,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { KENNZEICHNUNG_REPOSITORY, type KennzeichnungRepository } from '../kennzeichnung/kennzeichnung.repository.js'
import { LSTB_REPOSITORY, type LstbRepository } from './lstb.repository.js'
import type { LstbFeldDto } from './dto/lstb-feld.dto.js'
import type { LstbResponseDto } from './dto/lstb-response.dto.js'
import type { LstbWiderspruchDto } from './dto/lstb-widerspruch.dto.js'
import type { LstbZustandDto } from './dto/lstb-zustand.dto.js'
import { lstbDatenAus } from './lstb-daten.js'

function zustandAusDto(dto: LstbFeldDto): LstbFeldZustand {
  if (dto.kind === 'offen') return { kind: 'offen' }
  if (dto.kind === 'unklar') return { kind: 'unklar' }
  if (dto.wert === undefined || !istGueltigerBetrag(dto.wert)) {
    throw new InvalidInputError('FIELD_VALUE_INVALID', 'kind "erfasst" requires a non-negative whole-euro `wert`.')
  }
  return { kind: 'erfasst', wert: dto.wert }
}

function toFeldDto(zustand: LstbFeldZustand): LstbFeldDto {
  switch (zustand.kind) {
    case 'offen':
      return { kind: 'offen' }
    case 'unklar':
      return { kind: 'unklar' }
    case 'erfasst':
      return { kind: 'erfasst', wert: zustand.wert }
  }
}

function toWiderspruchDto(w: LstbWiderspruch): LstbWiderspruchDto {
  switch (w.art) {
    case 'lohnsteuer-uebersteigt-brutto':
      return { art: 'lohnsteuer-uebersteigt-brutto', lohnsteuer: w.lohnsteuer, bruttoarbeitslohn: w.bruttoarbeitslohn }
    case 'sozialversicherung-uebersteigt-brutto':
      return { art: 'sozialversicherung-uebersteigt-brutto', sozialversicherung: w.sozialversicherung, bruttoarbeitslohn: w.bruttoarbeitslohn }
  }
}

function toZustandDto(z: LstbZustand): LstbZustandDto {
  switch (z.kind) {
    case 'unvollstaendig':
      return { kind: 'unvollstaendig', offen: [...z.offen], unklar: [...z.unklar] }
    case 'widerspruch':
      return { kind: 'widerspruch', widersprueche: z.widersprueche.map(toWiderspruchDto) }
    case 'vollstaendig':
      return { kind: 'vollstaendig', bruttoarbeitslohn: z.bruttoarbeitslohn, lohnsteuer: z.lohnsteuer, sozialversicherung: z.sozialversicherung }
  }
}

function toResponse(daten: LstbDaten): LstbResponseDto {
  return {
    bruttoarbeitslohn: toFeldDto(daten.bruttoarbeitslohn),
    lohnsteuer: toFeldDto(daten.lohnsteuer),
    sozialversicherung: toFeldDto(daten.sozialversicherung),
    zustand: toZustandDto(lstbZustand(daten)),
  }
}

/** Application logic for the LStB guided mask: userId+steuerjahr-scoped read/write, then the honest-state mapping. */
@Injectable()
export class LstbService {
  constructor(
    @Inject(LSTB_REPOSITORY) private readonly repository: LstbRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(KENNZEICHNUNG_REPOSITORY) private readonly kennzeichnungen: KennzeichnungRepository,
  ) {}

  async getState(userId: string, steuerjahr: number): Promise<LstbResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, steuerjahr)
    if (record !== null) {
      await this.auditService.append({ userId, action: 'READ', resource: 'lstb' })
    }
    return toResponse(lstbDatenAus(record))
  }

  async setFeld(userId: string, steuerjahr: number, feld: LstbFeldId, dto: LstbFeldDto): Promise<LstbResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, steuerjahr)
    const daten = lstbDatenAus(record)
    const zustand = zustandAusDto(dto)
    const next = setzeLstbFeld(daten, feld, zustand)
    await this.repository.setFeld(userId, steuerjahr, feld, serialisiereLstbFeld(zustand))
    await this.kennzeichnungen.entferne(userId, steuerjahr, [kennzeichnungsKey('lstb', feld)])
    return toResponse(next)
  }
}
