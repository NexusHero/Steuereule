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
  LSTB_SOCIAL_LINES,
  type LstbSocialLine,
  lstbSocialSecurityFromLines,
  lstbSubsidyQuestionOpen,
} from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { PROVENANCE_REPOSITORY, type ProvenanceRepository } from '../marking/marking.repository.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from './lstb.repository.js'
import type { LstbFieldDto } from './dto/lstb-field.dto.js'
import type { LstbResponseDto } from './dto/lstb-response.dto.js'
import type { LstbConflictDto } from './dto/lstb-conflict.dto.js'
import type { LstbStatusDto } from './dto/lstb-state.dto.js'
import type { LstbChurchTaxDto } from './dto/lstb-church-tax.dto.js'
import type { LstbSubsidiesDto } from './dto/lstb-subsidies.dto.js'
import type { LstbEmployerDto } from './dto/lstb-employer.dto.js'
import { lstbLineValuesFrom, storeLstbLines, wageTaxCertificateDataFrom } from './lstb-data.js'
import type { LstbLinesDto, LstbLinesResponseDto } from './dto/lstb-lines.dto.js'
import type { LstbLinePatch, WageTaxCertificateRecord } from './lstb.repository.js'

const LSTB_FIELD_IDS: readonly WageTaxCertificateFieldId[] = ['bruttoarbeitslohn', 'lohnsteuer', 'sozialversicherung']

/**
 * Values read from a scanned LStB. The social insurance may be unreadable (null): it then stays open, and on a
 * further certificate the sum already recorded stands (ADR-0083).
 */
export type ScannedLstbValues = Readonly<Record<'bruttoarbeitslohn' | 'lohnsteuer', number>> & { readonly sozialversicherung: number | null }

/** Further lines of a scanned LStB the user confirmed; an absent line was not read and stays as it is. */
export type ScannedLstbLines = Readonly<Partial<Record<LstbSocialLine | 'kirchensteuer' | 'kirchensteuerEhegatte' | 'zuschuesseKvPv' | 'solidaritaetszuschlag', number>>>

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

  /** The employer named on the certificate (ADR-0099 §8): the Verlauf reads a change of job from it. */
  async getEmployer(userId: string, taxYear: number): Promise<LstbEmployerDto> {
    const record = await this.repository.findForUserAndYear(userId, taxYear)
    if (record !== null) await this.auditService.append({ userId, action: 'READ', resource: 'lstb' })
    return { arbeitgeber: record?.arbeitgeber ?? null }
  }

  async setEmployer(userId: string, taxYear: number, dto: LstbEmployerDto): Promise<LstbEmployerDto> {
    const name = dto.arbeitgeber?.trim() ?? ''
    const record = await this.repository.setEmployer(userId, taxYear, name === '' ? null : name)
    return { arbeitgeber: record.arbeitgeber ?? null }
  }

  /** Tax-free employer subsidies to health and care insurance (Zeile 24, ADR-0090). */
  async getSubsidies(userId: string, taxYear: number): Promise<LstbSubsidiesDto> {
    const record = await this.repository.findForUserAndYear(userId, taxYear)
    if (record !== null) await this.auditService.append({ userId, action: 'READ', resource: 'lstb' })
    return subsidiesDtoFrom(record)
  }

  async setSubsidies(userId: string, taxYear: number, dto: LstbSubsidiesDto): Promise<LstbSubsidiesDto> {
    const value = dto.zuschuesseKvPv
    if (value !== null && value !== undefined && !isValidAmount(value)) {
      throw new InvalidInputError('FIELD_VALUE_INVALID', 'Zuschüsse require a non-negative whole-euro amount or null.')
    }
    const record = await this.repository.setSubsidies(userId, taxYear, value === null || value === undefined ? null : String(value))
    return subsidiesDtoFrom(record)
  }

  /** Zeilen 22–27, 24c and 5 of the LStB, line by line (ADR-0093). */
  async getLines(userId: string, taxYear: number): Promise<LstbLinesResponseDto> {
    const record = await this.repository.findForUserAndYear(userId, taxYear)
    if (record !== null) await this.auditService.append({ userId, action: 'READ', resource: 'lstb' })
    return linesDtoFrom(record)
  }

  async setLines(userId: string, taxYear: number, dto: LstbLinesDto): Promise<LstbLinesResponseDto> {
    const patch: LstbLinePatch = {}
    for (const line of LSTB_SOCIAL_LINES) {
      const value = dto[line]
      if (value === undefined) continue
      if (value !== null && !isValidAmount(value)) throw new InvalidInputError('FIELD_VALUE_INVALID', `"${line}" requires a non-negative whole-euro amount or null.`)
      patch[line] = value === null ? null : String(value)
    }
    const soli = dto.solidaritaetszuschlag
    if (soli !== undefined) {
      if (soli !== null && (!Number.isFinite(soli) || soli < 0)) throw new InvalidInputError('FIELD_VALUE_INVALID', '"solidaritaetszuschlag" requires a non-negative amount or null.')
      patch.solidaritaetszuschlag = soli === null ? null : String(Math.round(soli * 100) / 100)
    }
    return linesDtoFrom(await storeLstbLines(this.repository, userId, taxYear, patch))
  }

  /** The further lines of a scanned LStB, written with the three values (`applyScannedLstbLines`). */
  async applyScannedLines(
    userId: string,
    taxYear: number,
    scanned: { readonly lines: ScannedLstbLines; readonly arbeitgeber: string | null },
    options: { readonly receiptId: string | null; readonly addToExisting: boolean },
  ): Promise<void> {
    await applyScannedLstbLines(this.repository, this.markings, userId, taxYear, scanned, options)
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
    options: {
      readonly receiptId: string | null
      readonly overwriteExisting: boolean
      /** A further certificate of the same year (second employer, a later payment): add, never replace. */
      readonly addToExisting?: boolean
    },
  ): Promise<LstbResponseDto> {
    for (const id of LSTB_FIELD_IDS) {
      const value = values[id]
      if (id === 'sozialversicherung' && value === null) continue
      if (value === null || !isValidAmount(value)) {
        throw new InvalidInputError('FIELD_VALUE_INVALID', `Field "${id}" requires a non-negative whole-euro integer.`)
      }
    }
    const current = await this.existingValues(userId, taxYear)
    const adding = options.addToExisting === true && current.hasExisting
    const read = LSTB_FIELD_IDS.filter((id) => values[id] !== null)
    if (adding && read.every((id) => current.existing[id] === values[id])) {
      throw new ConflictError('LSTB_SAME_CERTIFICATE', 'Diese Lohnsteuerbescheinigung ist schon erfasst.', { existing: current.existing })
    }
    const total = (id: WageTaxCertificateFieldId): WageTaxCertificateFieldState => {
      const value = values[id]
      const before = adding ? current.existing[id] : null
      // An unreadable value adds nothing: the recorded sum stands, or the field stays open.
      if (value === null) return before !== null && before !== undefined ? { kind: 'erfasst', value: before } : { kind: 'offen' }
      return { kind: 'erfasst', value: value + (before ?? 0) }
    }
    const candidate: WageTaxCertificateData = {
      bruttoarbeitslohn: total('bruttoarbeitslohn'),
      lohnsteuer: total('lohnsteuer'),
      sozialversicherung: total('sozialversicherung'),
    }
    const candidateStatus = wageTaxCertificateStatus(candidate)
    if (candidateStatus.kind === 'widerspruch') {
      throw new InvalidInputError(
        'LSTB_PLAUSIBILITY_CONFLICT',
        'Lohnsteuer oder Sozialversicherung übersteigt den Bruttoarbeitslohn.',
        { conflicts: candidateStatus.conflicts },
      )
    }

    if (current.hasExisting && !options.overwriteExisting && !adding) {
      throw new ConflictError(
        'LSTB_EXISTING_VALUES_CONFLICT',
        'Für dieses Steuerjahr liegen bereits LStB-Werte vor. Bestehende Werte ersetzen oder abbrechen?',
        { existing: current.existing },
      )
    }

    for (const id of LSTB_FIELD_IDS) {
      // A further certificate without this value leaves the recorded one and its provenance as they are.
      if (adding && values[id] === null) continue
      await this.repository.setField(userId, taxYear, id, serializeWageTaxCertificateField(candidate[id]))
      if (values[id] === null) {
        await this.markings.remove(userId, taxYear, [provenanceKey('lstb', id)])
      } else if (adding) {
        // A sum of two certificates is no single receipt's figure: the user's own, confirmed.
        await this.markings.save(userId, taxYear, { key: provenanceKey('lstb', id), provenance: { kind: 'nutzer' }, confirmed: true, proposal: null })
      } else if (options.receiptId !== null) {
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

/**
 * Writes the further lines of a scanned LStB next to the three values (`applyScannedValues`), in the same
 * transaction: each line to its field of the mask, the sum following the lines (ADR-0093), with Beleg
 * provenance. A further certificate adds its lines to those recorded and keeps the employer named first.
 */
export async function applyScannedLstbLines(
  repository: WageTaxCertificateRepository,
  markings: ProvenanceRepository,
  userId: string,
  taxYear: number,
  scanned: { readonly lines: ScannedLstbLines; readonly arbeitgeber: string | null },
  options: { readonly receiptId: string | null; readonly addToExisting: boolean },
): Promise<void> {
  const current = options.addToExisting ? await repository.findForUserAndYear(userId, taxYear) : null
  const wholeBefore = (value: string | null | undefined): number => (value !== null && value !== undefined && /^\d+$/.test(value) ? Number(value) : 0)
  const total = (line: keyof ScannedLstbLines, value: number): number => {
    const before = current?.[line as keyof WageTaxCertificateRecord] as string | null | undefined
    if (line !== 'solidaritaetszuschlag') return value + wholeBefore(before)
    const cents = before !== null && before !== undefined && /^\d+(\.\d{1,2})?$/.test(before) ? Math.round(Number(before) * 100) : 0
    return (cents + Math.round(value * 100)) / 100
  }
  const written: string[] = []
  const patch: LstbLinePatch = {}
  for (const line of LSTB_SOCIAL_LINES) {
    const value = scanned.lines[line]
    if (value === undefined) continue
    if (!isValidAmount(value)) throw new InvalidInputError('FIELD_VALUE_INVALID', `"${line}" requires a non-negative whole-euro amount.`)
    patch[line] = String(total(line, value))
    written.push(line)
  }
  const soli = scanned.lines.solidaritaetszuschlag
  if (soli !== undefined) {
    if (!Number.isFinite(soli) || soli < 0) throw new InvalidInputError('FIELD_VALUE_INVALID', '"solidaritaetszuschlag" requires a non-negative amount.')
    patch.solidaritaetszuschlag = String(total('solidaritaetszuschlag', Math.round(soli * 100) / 100))
    written.push('solidaritaetszuschlag')
  }
  if (Object.keys(patch).length > 0) await storeLstbLines(repository, userId, taxYear, patch)

  const church = { kirchensteuer: scanned.lines.kirchensteuer, kirchensteuerEhegatte: scanned.lines.kirchensteuerEhegatte }
  if (church.kirchensteuer !== undefined || church.kirchensteuerEhegatte !== undefined) {
    const stored = await repository.findForUserAndYear(userId, taxYear)
    const next = (line: 'kirchensteuer' | 'kirchensteuerEhegatte'): string | null => {
      const value = church[line]
      if (value === undefined) return stored?.[line] ?? null
      if (!isValidAmount(value)) throw new InvalidInputError('FIELD_VALUE_INVALID', `"${line}" requires a non-negative whole-euro amount.`)
      written.push(line)
      return String(total(line, value))
    }
    await repository.setChurchTax(userId, taxYear, { kirchensteuer: next('kirchensteuer'), kirchensteuerEhegatte: next('kirchensteuerEhegatte') })
  }
  const subsidies = scanned.lines.zuschuesseKvPv
  if (subsidies !== undefined) {
    if (!isValidAmount(subsidies)) throw new InvalidInputError('FIELD_VALUE_INVALID', '"zuschuesseKvPv" requires a non-negative whole-euro amount.')
    await repository.setSubsidies(userId, taxYear, String(total('zuschuesseKvPv', subsidies)))
    written.push('zuschuesseKvPv')
  }
  const employer = scanned.arbeitgeber?.trim() ?? ''
  if (employer !== '') {
    const recorded = (await repository.findForUserAndYear(userId, taxYear))?.arbeitgeber ?? null
    if (!options.addToExisting || recorded === null || recorded.trim() === '') await repository.setEmployer(userId, taxYear, employer)
  }

  for (const line of written) {
    const key = provenanceKey('lstb', line)
    // A sum of two certificates is no single receipt's figure: the user's own, confirmed (as for the three values).
    if (options.addToExisting) await markings.save(userId, taxYear, { key, provenance: { kind: 'nutzer' }, confirmed: true, proposal: null })
    else if (options.receiptId !== null) await markings.save(userId, taxYear, { key, provenance: { kind: 'beleg', receiptId: options.receiptId }, confirmed: true, proposal: null })
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

/** The stored lines with the derived sum and the open Zeile 24 (ADR-0093). */
export function linesDtoFrom(record: WageTaxCertificateRecord | null): LstbLinesResponseDto {
  const lines = lstbLineValuesFrom(record)
  const soli = record?.solidaritaetszuschlag
  return {
    rvArbeitnehmer: lines.rvArbeitnehmer ?? null,
    rvArbeitgeber: lines.rvArbeitgeber ?? null,
    kvArbeitnehmer: lines.kvArbeitnehmer ?? null,
    pvArbeitnehmer: lines.pvArbeitnehmer ?? null,
    avArbeitnehmer: lines.avArbeitnehmer ?? null,
    zuschussPv: lines.zuschussPv ?? null,
    solidaritaetszuschlag: soli !== null && soli !== undefined && /^\d+(\.\d{1,2})?$/.test(soli) ? Number(soli) : null,
    zuschuesseKvPv: lines.zuschuesseKvPv ?? null,
    sozialversicherung: lstbSocialSecurityFromLines(lines),
    subsidyOpen: lstbSubsidyQuestionOpen(lines),
  }
}

/** Zeile 24 as a whole-euro number; anything unreadable counts as not entered. */
export function subsidiesDtoFrom(record: { zuschuesseKvPv?: string | null } | null): LstbSubsidiesDto {
  const value = record?.zuschuesseKvPv
  return { zuschuesseKvPv: value !== null && value !== undefined && /^\d+$/.test(value) ? Number(value) : null }
}
