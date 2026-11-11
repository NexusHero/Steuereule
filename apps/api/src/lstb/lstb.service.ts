import { Inject, Injectable } from '@nestjs/common'
import { ConflictError, InvalidInputError } from '../common/domain-error.js'
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
import type { LstbChurchTaxDto } from './dto/lstb-church-tax.dto.js'
import { wageTaxCertificateDataFrom } from './lstb-data.js'

const LSTB_FIELD_IDS: readonly WageTaxCertificateFieldId[] = ['bruttoarbeitslohn', 'lohnsteuer', 'sozialversicherung']

export type ScannedLstbValues = Readonly<Record<WageTaxCertificateFieldId, number>>

export interface ExistingLstbValues {
  readonly hasExisting: boolean
  readonly existing: Readonly<Record<WageTaxCertificateFieldId, number | null>>
}

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

  /** Church tax lines of the LStB (Zeilen 6 und 7). */
  async getChurchTax(userId: string, taxYear: number): Promise<LstbChurchTaxDto> {
    const record = await this.repository.findForUserAndYear(userId, taxYear)
    if (record !== null) await this.auditService.append({ userId, action: 'READ', resource: 'lstb' })
    return churchTaxDtoFrom(record)
  }

  async setChurchTax(userId: string, taxYear: number, dto: LstbChurchTaxDto): Promise<LstbChurchTaxDto> {
    for (const value of [dto.kirchensteuer, dto.kirchensteuerEhegatte]) {
      if (value !== null && value !== undefined && !isValidAmount(value)) {
        throw new InvalidInputError('FIELD_VALUE_INVALID', 'Kirchensteuer requires a non-negative whole-euro amount or null.')
      }
    }
    const serialize = (value: number | null | undefined) => (value === null || value === undefined ? null : String(value))
    const record = await this.repository.setChurchTax(userId, taxYear, {
      kirchensteuer: serialize(dto.kirchensteuer),
      kirchensteuerEhegatte: serialize(dto.kirchensteuerEhegatte),
    })
    return churchTaxDtoFrom(record)
  }

  /** Values already captured for the year — a scan must never overwrite them silently (ADR-0008). */
  async existingValues(userId: string, taxYear: number): Promise<ExistingLstbValues> {
    const data = wageTaxCertificateDataFrom(await this.repository.findForUserAndYear(userId, taxYear))
    const valueOf = (id: WageTaxCertificateFieldId): number | null => {
      const state = data[id]
      return state.kind === 'erfasst' ? state.value : null
    }
    return {
      hasExisting: LSTB_FIELD_IDS.some((id) => data[id].kind !== 'offen'),
      existing: {
        bruttoarbeitslohn: valueOf('bruttoarbeitslohn'),
        lohnsteuer: valueOf('lohnsteuer'),
        sozialversicherung: valueOf('sozialversicherung'),
      },
    }
  }

  /**
   * Writes all three confirmed scan values with Beleg provenance. Callers run it inside a
   * transaction together with their own bookkeeping, so the write is all-or-nothing.
   */
  async applyScannedValues(
    userId: string,
    taxYear: number,
    values: ScannedLstbValues,
    options: { readonly receiptId: string | null; readonly overwriteExisting: boolean },
  ): Promise<LstbResponseDto> {
    for (const id of LSTB_FIELD_IDS) {
      if (!isValidAmount(values[id])) {
        throw new InvalidInputError('FIELD_VALUE_INVALID', `Field "${id}" requires a non-negative whole-euro integer.`)
      }
    }
    const candidate: WageTaxCertificateData = {
      bruttoarbeitslohn: { kind: 'erfasst', value: values.bruttoarbeitslohn },
      lohnsteuer: { kind: 'erfasst', value: values.lohnsteuer },
      sozialversicherung: { kind: 'erfasst', value: values.sozialversicherung },
    }
    const candidateStatus = wageTaxCertificateStatus(candidate)
    if (candidateStatus.kind === 'widerspruch') {
      throw new InvalidInputError(
        'LSTB_PLAUSIBILITY_CONFLICT',
        'Lohnsteuer oder Sozialversicherung übersteigt den Bruttoarbeitslohn.',
        { conflicts: candidateStatus.conflicts },
      )
    }

    const current = await this.existingValues(userId, taxYear)
    if (current.hasExisting && !options.overwriteExisting) {
      throw new ConflictError(
        'LSTB_EXISTING_VALUES_CONFLICT',
        'Für dieses Steuerjahr liegen bereits LStB-Werte vor. Bestehende Werte ersetzen oder abbrechen?',
        { existing: current.existing },
      )
    }

    for (const id of LSTB_FIELD_IDS) {
      await this.repository.setField(userId, taxYear, id, serializeWageTaxCertificateField(candidate[id]))
      if (options.receiptId !== null) {
        await this.markings.save(userId, taxYear, {
          key: provenanceKey('lstb', id),
          provenance: { kind: 'beleg', receiptId: options.receiptId },
          confirmed: true,
          proposal: null,
        })
      } else {
        await this.markings.remove(userId, taxYear, [provenanceKey('lstb', id)])
      }
    }
    return toResponse(candidate)
  }
}

/** Stored whole-euro strings → numbers; anything unreadable counts as not entered. */
export function churchTaxDtoFrom(record: { kirchensteuer?: string | null; kirchensteuerEhegatte?: string | null } | null): LstbChurchTaxDto {
  const parse = (value: string | null | undefined): number | null => {
    if (value === null || value === undefined || !/^\d+$/.test(value)) return null
    return Number(value)
  }
  return { kirchensteuer: parse(record?.kirchensteuer), kirchensteuerEhegatte: parse(record?.kirchensteuerEhegatte) }
}
