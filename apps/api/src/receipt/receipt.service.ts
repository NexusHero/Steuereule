import { Inject, Injectable, Optional } from '@nestjs/common'
import { assignmentFromData, isReceiptType, type ReceiptAssignment, type ReceiptType } from '@steuereule/core'
import { InvalidInputError, NotFoundError } from '../common/domain-error.js'
import { AuditService } from '../audit/audit.service.js'
import { RECEIPT_REPOSITORY, type ReceiptRecord, type ReceiptRepository } from './receipt.repository.js'
import { detectAllowedReceiptMimeType, type AllowedReceiptMimeType } from './storage/magic-bytes.js'
import { STORAGE_PORT, type StoragePort, type StoredReceiptMeta } from './storage/storage.port.js'
import type { DeleteReceiptResponseDto, ReceiptResponseDto } from './dto/receipt-response.dto.js'
import type { CreateReceiptDto } from './dto/create-receipt.dto.js'
import type { SetAssignmentDto } from './dto/set-assignment.dto.js'
import type { AssignmentDto } from './dto/assignment.dto.js'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export interface UploadReceiptInput {
  readonly buffer: Buffer
  readonly fileName: string
  readonly kind?: string | undefined
  readonly belegdatum?: string | undefined
  readonly zahlungsdatum?: string | undefined
}

export interface DownloadedReceiptFile {
  readonly buffer: Buffer
  readonly mimeType: AllowedReceiptMimeType
  readonly fileName: string
}

function assertIsoDateOrUndefined(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (!ISO_DATE.test(trimmed) || Number.isNaN(new Date(trimmed).getTime())) {
    throw new InvalidInputError('RECEIPT_DATE_INVALID', `Ungültiges Datum in "${field}" (erwartet YYYY-MM-DD).`)
  }
  return trimmed
}

function assertReceiptTypeOrUndefined(value: string | undefined): ReceiptType | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (!isReceiptType(trimmed)) {
    throw new InvalidInputError('RECEIPT_KIND_INVALID', `Unbekannte Belegart "${trimmed}".`)
  }
  return trimmed
}

function toAssignmentDto(assignment: ReceiptAssignment): AssignmentDto {
  switch (assignment.kind) {
    case 'ungebunden':
      return { kind: 'ungebunden' }
    case 'vorgeschlagen':
      return { kind: 'vorgeschlagen', taxYear: assignment.proposal.taxYear, provenance: assignment.proposal.provenance }
    case 'zugeordnet':
      return { kind: 'zugeordnet', taxYear: assignment.taxYear }
    case 'konflikt':
      return {
        kind: 'konflikt',
        taxYear: assignment.assigned,
        proposalYear: assignment.proposal.taxYear,
        provenance: assignment.proposal.provenance,
      }
  }
}

function toReceiptResponse(record: ReceiptRecord, fallbackMeta?: StoredReceiptMeta | null): ReceiptResponseDto {
  const fileMeta = record.fileMeta ?? fallbackMeta ?? null
  return {
    id: record.id,
    fileName: record.fileName,
    kind: record.kind ?? null,
    belegdatum: record.belegdatum ?? null,
    zahlungsdatum: record.zahlungsdatum ?? null,
    hasFile: fileMeta !== null,
    mimeType: fileMeta?.mimeType ?? null,
    byteLength: fileMeta?.byteLength ?? null,
    assignment: toAssignmentDto(assignmentFromData(record)),
  }
}

/** Application logic for the Beleg-Posteingang: userId-scoped reads/writes, encrypted binary storage, and derived-Zuordnung mapping. */
@Injectable()
export class ReceiptService {
  constructor(
    @Inject(RECEIPT_REPOSITORY) private readonly repository: ReceiptRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Optional() @Inject(STORAGE_PORT) private readonly storage?: StoragePort,
  ) {}

  async list(userId: string): Promise<ReceiptResponseDto[]> {
    const rows = await this.repository.findAllForUser(userId)
    if (rows.length > 0) {
      await this.auditService.append({ userId, action: 'READ', resource: 'beleg' })
    }
    return rows.map((row) => toReceiptResponse(row))
  }

  async create(userId: string, dto: CreateReceiptDto): Promise<ReceiptResponseDto> {
    const record = await this.repository.create(userId, {
      fileName: dto.fileName,
      ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
      ...(dto.belegdatum !== undefined ? { belegdatum: dto.belegdatum } : {}),
      ...(dto.zahlungsdatum !== undefined ? { zahlungsdatum: dto.zahlungsdatum } : {}),
    })
    return toReceiptResponse(record)
  }

  async upload(userId: string, input: UploadReceiptInput): Promise<ReceiptResponseDto> {
    if (!this.storage) {
      throw new Error('Receipt binary storage adapter is not configured.')
    }

    const mimeType = detectAllowedReceiptMimeType(input.buffer)
    const cleanFileName = input.fileName.trim().slice(0, 255) || 'beleg'
    const kind = assertReceiptTypeOrUndefined(input.kind)
    const belegdatum = assertIsoDateOrUndefined(input.belegdatum, 'belegdatum')
    const zahlungsdatum = assertIsoDateOrUndefined(input.zahlungsdatum, 'zahlungsdatum')

    const record = await this.repository.create(userId, {
      fileName: cleanFileName,
      ...(kind !== undefined ? { kind } : {}),
      ...(belegdatum !== undefined ? { belegdatum } : {}),
      ...(zahlungsdatum !== undefined ? { zahlungsdatum } : {}),
    })

    try {
      const storedMeta = await this.storage.put({
        userId,
        receiptId: record.id,
        buffer: input.buffer,
        mimeType,
      })
      const repoWithFileMeta = this.repository as ReceiptRepository & {
        setFileMeta?: (ownerId: string, receiptId: string, meta: { mimeType: string; byteLength: number } | null) => void
      }
      repoWithFileMeta.setFileMeta?.(userId, record.id, {
        mimeType: storedMeta.mimeType,
        byteLength: storedMeta.byteLength,
      })
      return toReceiptResponse(record, storedMeta)
    } catch (error) {
      await this.repository.deleteForUser(userId, record.id).catch(() => {})
      throw error
    }
  }

  async getFile(userId: string, id: string): Promise<DownloadedReceiptFile> {
    const record = await this.repository.findByIdForUser(userId, id)
    if (record === null) {
      throw new NotFoundError('BELEG_NOT_FOUND', `Beleg "${id}" does not exist for this account.`)
    }
    const stored = this.storage ? await this.storage.get(userId, id) : null
    if (stored === null) {
      throw new NotFoundError('BELEG_DATEI_NOT_FOUND', `Für Beleg "${id}" liegt keine entschlüsselbare Originaldatei vor.`)
    }
    await this.auditService.append({ userId, action: 'READ', resource: 'beleg' })
    return {
      buffer: stored.buffer,
      mimeType: stored.meta.mimeType,
      fileName: record.fileName,
    }
  }

  async setAssignment(userId: string, id: string, dto: SetAssignmentDto): Promise<ReceiptResponseDto> {
    const record = await this.repository.setAssignment(userId, id, {
      taxYear: dto.taxYear,
      proposalDismissed: dto.proposalDismissed ?? false,
    })
    if (record === null) {
      throw new NotFoundError('BELEG_NOT_FOUND', `Beleg "${id}" does not exist for this account.`)
    }
    return toReceiptResponse(record)
  }

  async delete(userId: string, id: string): Promise<DeleteReceiptResponseDto> {
    const existing = await this.repository.findByIdForUser(userId, id)
    if (existing === null) {
      throw new NotFoundError('BELEG_NOT_FOUND', `Beleg "${id}" does not exist for this account.`)
    }
    if (this.storage) {
      await this.storage.delete(userId, id)
    }
    await this.repository.deleteForUser(userId, id)
    return { deleted: true }
  }
}
