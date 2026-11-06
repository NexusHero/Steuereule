import { Inject, Injectable } from '@nestjs/common'
import { NotFoundError } from '../common/domain-error.js'
import { assignmentFromData, type ReceiptAssignment } from '@steuereule/core'
import { AuditService } from '../audit/audit.service.js'
import { RECEIPT_REPOSITORY, type ReceiptRecord, type ReceiptRepository } from './beleg.repository.js'
import type { ReceiptResponseDto } from './dto/beleg-response.dto.js'
import type { CreateReceiptDto } from './dto/create-beleg.dto.js'
import type { SetAssignmentDto } from './dto/set-zuordnung.dto.js'
import type { AssignmentDto } from './dto/zuordnung.dto.js'

function toAssignmentDto(assignment: ReceiptAssignment): AssignmentDto {
  switch (assignment.kind) {
    case 'ungebunden':
      return { kind: 'ungebunden' }
    case 'vorgeschlagen':
      return { kind: 'vorgeschlagen', steuerjahr: assignment.proposal.steuerjahr, provenance: assignment.proposal.provenance }
    case 'zugeordnet':
      return { kind: 'zugeordnet', steuerjahr: assignment.steuerjahr }
    case 'konflikt':
      return {
        kind: 'konflikt',
        steuerjahr: assignment.assigned,
        proposalYear: assignment.proposal.steuerjahr,
        provenance: assignment.proposal.provenance,
      }
  }
}

function toReceiptResponse(record: ReceiptRecord): ReceiptResponseDto {
  return {
    id: record.id,
    dateiname: record.dateiname,
    art: record.art ?? null,
    belegdatum: record.belegdatum ?? null,
    zahlungsdatum: record.zahlungsdatum ?? null,
    assignment: toAssignmentDto(assignmentFromData(record)),
  }
}

/** Application logic for the Beleg-Posteingang: userId-scoped reads/writes, then the derived-Zuordnung mapping. */
@Injectable()
export class ReceiptService {
  constructor(
    @Inject(RECEIPT_REPOSITORY) private readonly repository: ReceiptRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async list(userId: string): Promise<ReceiptResponseDto[]> {
    const rows = await this.repository.findAllForUser(userId)
    if (rows.length > 0) {
      await this.auditService.append({ userId, action: 'READ', resource: 'beleg' })
    }
    return rows.map(toReceiptResponse)
  }

  async create(userId: string, dto: CreateReceiptDto): Promise<ReceiptResponseDto> {
    const record = await this.repository.create(userId, {
      dateiname: dto.dateiname,
      ...(dto.art !== undefined ? { art: dto.art } : {}),
      ...(dto.belegdatum !== undefined ? { belegdatum: dto.belegdatum } : {}),
      ...(dto.zahlungsdatum !== undefined ? { zahlungsdatum: dto.zahlungsdatum } : {}),
    })
    return toReceiptResponse(record)
  }

  async setAssignment(userId: string, id: string, dto: SetAssignmentDto): Promise<ReceiptResponseDto> {
    const record = await this.repository.setAssignment(userId, id, {
      steuerjahr: dto.steuerjahr,
      vorschlagVerworfen: dto.vorschlagVerworfen ?? false,
    })
    if (record === null) {
      throw new NotFoundError('BELEG_NOT_FOUND', `Beleg "${id}" does not exist for this account.`)
    }
    return toReceiptResponse(record)
  }
}
