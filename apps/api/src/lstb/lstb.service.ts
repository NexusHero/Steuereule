import { Inject, Injectable } from '@nestjs/common'
import { InvalidInputError } from '../common/domain-error.js'
import {
  isValidAmount,
  wageTaxCertificateStatus,
  serializeWageTaxCertificateField,
  setWageTaxCertificateField,
  type WageTaxCertificateData,
  type WageTaxCertificateFieldId,
  type WageTaxCertificateFieldState,
  type WageTaxCertificateStatus,
  type WageTaxCertificateConflict,
  provenanceKey,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { PROVENANCE_REPOSITORY, type ProvenanceRepository } from '../kennzeichnung/kennzeichnung.repository.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from './lstb.repository.js'
import type { LstbFeldDto } from './dto/lstb-feld.dto.js'
import type { LstbResponseDto } from './dto/lstb-response.dto.js'
import type { LstbWiderspruchDto } from './dto/lstb-widerspruch.dto.js'
import type { LstbZustandDto } from './dto/lstb-zustand.dto.js'
import { wageTaxCertificateDataFrom } from './lstb-daten.js'

function zustandAusDto(dto: LstbFeldDto): WageTaxCertificateFieldState {
  if (dto.kind === 'offen') return { kind: 'offen' }
  if (dto.kind === 'unklar') return { kind: 'unklar' }
  if (dto.wert === undefined || !isValidAmount(dto.wert)) {
    throw new InvalidInputError('FIELD_VALUE_INVALID', 'kind "erfasst" requires a non-negative whole-euro `wert`.')
  }
  return { kind: 'erfasst', wert: dto.wert }
}

function toFeldDto(zustand: WageTaxCertificateFieldState): LstbFeldDto {
  switch (zustand.kind) {
    case 'offen':
      return { kind: 'offen' }
    case 'unklar':
      return { kind: 'unklar' }
    case 'erfasst':
      return { kind: 'erfasst', wert: zustand.wert }
  }
}

function toWiderspruchDto(w: WageTaxCertificateConflict): LstbWiderspruchDto {
  switch (w.art) {
    case 'lohnsteuer-uebersteigt-brutto':
      return { art: 'lohnsteuer-uebersteigt-brutto', lohnsteuer: w.lohnsteuer, bruttoarbeitslohn: w.bruttoarbeitslohn }
    case 'sozialversicherung-uebersteigt-brutto':
      return { art: 'sozialversicherung-uebersteigt-brutto', sozialversicherung: w.sozialversicherung, bruttoarbeitslohn: w.bruttoarbeitslohn }
  }
}

function toZustandDto(z: WageTaxCertificateStatus): LstbZustandDto {
  switch (z.kind) {
    case 'unvollstaendig':
      return { kind: 'unvollstaendig', offen: [...z.offen], unklar: [...z.unklar] }
    case 'widerspruch':
      return { kind: 'widerspruch', widersprueche: z.widersprueche.map(toWiderspruchDto) }
    case 'vollstaendig':
      return { kind: 'vollstaendig', bruttoarbeitslohn: z.bruttoarbeitslohn, lohnsteuer: z.lohnsteuer, sozialversicherung: z.sozialversicherung }
  }
}

function toResponse(daten: WageTaxCertificateData): LstbResponseDto {
  return {
    bruttoarbeitslohn: toFeldDto(daten.bruttoarbeitslohn),
    lohnsteuer: toFeldDto(daten.lohnsteuer),
    sozialversicherung: toFeldDto(daten.sozialversicherung),
    zustand: toZustandDto(wageTaxCertificateStatus(daten)),
  }
}

/** Application logic for the LStB guided mask: userId+steuerjahr-scoped read/write, then the honest-state mapping. */
@Injectable()
export class LstbService {
  constructor(
    @Inject(WAGE_TAX_CERTIFICATE_REPOSITORY) private readonly repository: WageTaxCertificateRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PROVENANCE_REPOSITORY) private readonly kennzeichnungen: ProvenanceRepository,
  ) {}

  async getState(userId: string, steuerjahr: number): Promise<LstbResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, steuerjahr)
    if (record !== null) {
      await this.auditService.append({ userId, action: 'READ', resource: 'lstb' })
    }
    return toResponse(wageTaxCertificateDataFrom(record))
  }

  async setFeld(userId: string, steuerjahr: number, feld: WageTaxCertificateFieldId, dto: LstbFeldDto): Promise<LstbResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, steuerjahr)
    const daten = wageTaxCertificateDataFrom(record)
    const zustand = zustandAusDto(dto)
    const next = setWageTaxCertificateField(daten, feld, zustand)
    await this.repository.setFeld(userId, steuerjahr, feld, serializeWageTaxCertificateField(zustand))
    await this.kennzeichnungen.entferne(userId, steuerjahr, [provenanceKey('lstb', feld)])
    return toResponse(next)
  }
}
