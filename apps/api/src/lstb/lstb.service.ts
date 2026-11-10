import { Inject, Injectable, Optional } from '@nestjs/common'
import { ConflictError, InvalidInputError, NotFoundError } from '../common/domain-error.js'
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
import {
  ADVISOR_REPOSITORY,
  markLstbActionsAppliedInRepo,
  type AdvisorRepository,
} from '../advisor/advisor.repository.js'
import { AuditService } from '../audit/audit.service.js'
import { PROVENANCE_REPOSITORY, type ProvenanceRepository } from '../marking/marking.repository.js'
import { passThroughTransactionRunner, TRANSACTION_RUNNER, type TransactionRunner } from '../prisma/transaction.js'
import { RECEIPT_REPOSITORY, type ReceiptRepository } from '../receipt/receipt.repository.js'
import { WAGE_TAX_CERTIFICATE_REPOSITORY, type WageTaxCertificateRepository } from './lstb.repository.js'
import type { ConfirmLstbScanDto } from './dto/confirm-lstb-scan.dto.js'
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
    @Optional() @Inject(RECEIPT_REPOSITORY) private readonly receiptRepository?: ReceiptRepository,
    @Optional() @Inject(ADVISOR_REPOSITORY) private readonly advisorRepository?: AdvisorRepository,
    @Optional()
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner = passThroughTransactionRunner,
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

  async applyConfirmedScan(
    actorUserId: string,
    targetUserId: string,
    taxYear: number,
    dto: ConfirmLstbScanDto,
  ): Promise<LstbResponseDto> {
    const fieldsToApply: readonly { id: WageTaxCertificateFieldId; value: number }[] = [
      { id: 'bruttoarbeitslohn', value: dto.bruttoarbeitslohn },
      { id: 'lohnsteuer', value: dto.lohnsteuer },
      { id: 'sozialversicherung', value: dto.sozialversicherung },
    ]
    for (const item of fieldsToApply) {
      if (!isValidAmount(item.value)) {
        throw new InvalidInputError(
          'FIELD_VALUE_INVALID',
          `Field "${item.id}" requires a non-negative whole-euro integer.`,
        )
      }
    }

    const candidate: WageTaxCertificateData = {
      bruttoarbeitslohn: { kind: 'erfasst', value: dto.bruttoarbeitslohn },
      lohnsteuer: { kind: 'erfasst', value: dto.lohnsteuer },
      sozialversicherung: { kind: 'erfasst', value: dto.sozialversicherung },
    }
    const candidateStatus = wageTaxCertificateStatus(candidate)
    if (candidateStatus.kind === 'widerspruch') {
      throw new InvalidInputError(
        'LSTB_PLAUSIBILITY_CONFLICT',
        'Lohnsteuer oder Sozialversicherung übersteigt den Bruttoarbeitslohn.',
        { conflicts: candidateStatus.conflicts },
      )
    }

    if (dto.receiptId && this.receiptRepository) {
      const receipt = await this.receiptRepository.findByIdForUser(actorUserId, dto.receiptId)
      if (receipt === null) {
        throw new NotFoundError('BELEG_NOT_FOUND', `Beleg "${dto.receiptId}" does not exist for this account.`)
      }
    }

    return this.transactions.run(async () => {
      const existingRecord = await this.repository.findForUserAndYear(targetUserId, taxYear)
      const existingData = wageTaxCertificateDataFrom(existingRecord)
      const hasExisting =
        existingData.bruttoarbeitslohn.kind !== 'offen' ||
        existingData.lohnsteuer.kind !== 'offen' ||
        existingData.sozialversicherung.kind !== 'offen'

      if (hasExisting && !dto.overwriteExisting) {
        throw new ConflictError(
          'LSTB_EXISTING_VALUES_CONFLICT',
          'Für dieses Steuerjahr liegen bereits LStB-Werte vor. Bestehende Werte ersetzen oder abbrechen?',
          {
            existing: {
              bruttoarbeitslohn:
                existingData.bruttoarbeitslohn.kind === 'erfasst' ? existingData.bruttoarbeitslohn.value : null,
              lohnsteuer: existingData.lohnsteuer.kind === 'erfasst' ? existingData.lohnsteuer.value : null,
              sozialversicherung:
                existingData.sozialversicherung.kind === 'erfasst' ? existingData.sozialversicherung.value : null,
            },
          },
        )
      }

      for (const item of fieldsToApply) {
        const serialized = serializeWageTaxCertificateField({ kind: 'erfasst', value: item.value })
        await this.repository.setField(targetUserId, taxYear, item.id, serialized)
        if (dto.receiptId) {
          await this.markings.save(targetUserId, taxYear, {
            key: provenanceKey('lstb', item.id),
            provenance: { kind: 'beleg', receiptId: dto.receiptId },
            confirmed: true,
            proposal: null,
          })
        } else {
          await this.markings.remove(targetUserId, taxYear, [provenanceKey('lstb', item.id)])
        }
      }

      if (dto.actionIds && dto.actionIds.length > 0 && this.advisorRepository) {
        await markLstbActionsAppliedInRepo(this.advisorRepository, actorUserId, taxYear, dto.actionIds)
      }

      return toResponse(candidate)
    })
  }
}
