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
import { PROVENANCE_REPOSITORY, type ProvenanceRepository } from '../marking/marking.repository.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from './lstb.repository.js'
import type { LstbFieldDto } from './dto/lstb-field.dto.js'
import type { LstbResponseDto } from './dto/lstb-response.dto.js'
import type { LstbConflictDto } from './dto/lstb-conflict.dto.js'
import type { LstbStatusDto } from './dto/lstb-state.dto.js'
import { wageTaxCertificateDataFrom } from './lstb-data.js'

function stateFromDto(dto: LstbFieldDto): WageTaxCertificateFieldState {
  if (dto.kind === 'offen') return { kind: 'offen' }
  if (dto.kind === 'unklar') return { kind: 'unklar' }
  if (dto.value === undefined || !isValidAmount(dto.value)) {
    throw new InvalidInputError('FIELD_VALUE_INVALID', 'kind "erfasst" requires a non-negative whole-euro `wert`.')
  }
  return { kind: 'erfasst', value: dto.value }
}

function toFieldDto(state: WageTaxCertificateFieldState): LstbFieldDto {
  switch (state.kind) {
    case 'offen':
      return { kind: 'offen' }
    case 'unklar':
      return { kind: 'unklar' }
    case 'erfasst':
      return { kind: 'erfasst', value: state.value }
  }
}

function toConflictDto(w: WageTaxCertificateConflict): LstbConflictDto {
  switch (w.kind) {
    case 'lohnsteuer-uebersteigt-brutto':
      return { kind: 'lohnsteuer-uebersteigt-brutto', lohnsteuer: w.lohnsteuer, bruttoarbeitslohn: w.bruttoarbeitslohn }
    case 'sozialversicherung-uebersteigt-brutto':
      return { kind: 'sozialversicherung-uebersteigt-brutto', sozialversicherung: w.sozialversicherung, bruttoarbeitslohn: w.bruttoarbeitslohn }
  }
}

function toStateDto(z: WageTaxCertificateStatus): LstbStatusDto {
  switch (z.kind) {
    case 'unvollstaendig':
      return { kind: 'unvollstaendig', open: [...z.open], unclear: [...z.unclear] }
    case 'widerspruch':
      return { kind: 'widerspruch', conflicts: z.conflicts.map(toConflictDto) }
    case 'vollstaendig':
      return { kind: 'vollstaendig', bruttoarbeitslohn: z.bruttoarbeitslohn, lohnsteuer: z.lohnsteuer, sozialversicherung: z.sozialversicherung }
  }
}

function toResponse(data: WageTaxCertificateData): LstbResponseDto {
  return {
    bruttoarbeitslohn: toFieldDto(data.bruttoarbeitslohn),
    lohnsteuer: toFieldDto(data.lohnsteuer),
    sozialversicherung: toFieldDto(data.sozialversicherung),
    state: toStateDto(wageTaxCertificateStatus(data)),
  }
}

/** Application logic for the LStB guided mask: userId+steuerjahr-scoped read/write, then the honest-state mapping. */
@Injectable()
export class LstbService {
  constructor(
    @Inject(WAGE_TAX_CERTIFICATE_REPOSITORY) private readonly repository: WageTaxCertificateRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PROVENANCE_REPOSITORY) private readonly markings: ProvenanceRepository,
  ) {}

  async getState(userId: string, taxYear: number): Promise<LstbResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, taxYear)
    if (record !== null) {
      await this.auditService.append({ userId, action: 'READ', resource: 'lstb' })
    }
    return toResponse(wageTaxCertificateDataFrom(record))
  }

  async setField(userId: string, taxYear: number, field: WageTaxCertificateFieldId, dto: LstbFieldDto): Promise<LstbResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, taxYear)
    const data = wageTaxCertificateDataFrom(record)
    const state = stateFromDto(dto)
    const next = setWageTaxCertificateField(data, field, state)
    await this.repository.setField(userId, taxYear, field, serializeWageTaxCertificateField(state))
    await this.markings.remove(userId, taxYear, [provenanceKey('lstb', field)])
    return toResponse(next)
  }
}
