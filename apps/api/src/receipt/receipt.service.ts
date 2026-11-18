import { Inject, Injectable, Optional } from '@nestjs/common'
import { ISO_DATE_PATTERN, assignmentFromData, isReceiptType, type ReceiptAssignment, type ReceiptType } from '@steuereule/core'
import { AdvisorService } from '../advisor/advisor.service.js'
import type { ReceiptDraftRecord } from '../advisor/advisor.repository.js'
import { InvalidInputError, NotFoundError } from '../common/domain-error.js'
import { AuditService } from '../audit/audit.service.js'
import { draftsByReceipt, duplicateDto, filledFieldsOf, originalsByContent, processingOf } from './receipt-state.js'
import { RECEIPT_REPOSITORY, type ReceiptRecord, type ReceiptRepository } from './receipt.repository.js'
import { detectAllowedReceiptMimeType, type AllowedReceiptMimeType } from './storage/magic-bytes.js'
import { STORAGE_PORT, type StoragePort, type StoredReceiptMeta } from './storage/storage.port.js'
import type { DeleteReceiptResponseDto, ReceiptResponseDto } from './dto/receipt-response.dto.js'
import type { CreateReceiptDto } from './dto/create-receipt.dto.js'
import type { SetAssignmentDto } from './dto/set-assignment.dto.js'
import type { AssignmentDto } from './dto/assignment.dto.js'

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
  if (!ISO_DATE_PATTERN.test(trimmed) || Number.isNaN(new Date(trimmed).getTime())) {
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

/** What the inbox derives beside the stored facts (ADR-0097): the Beleg's drafts and the older upload it repeats. */
interface DerivedReceiptFacts {
  readonly drafts: readonly ReceiptDraftRecord[]
  readonly original?: ReceiptRecord | undefined
}

export interface DeleteReceiptOptions {
  /** Take back the values this Beleg filled and withdraw its waiting drafts first (ADR-0097 §6). */
  readonly takeBackValues?: boolean | undefined
}

function toReceiptResponse(record: ReceiptRecord, derived: DerivedReceiptFacts, fallbackMeta?: StoredReceiptMeta | null): ReceiptResponseDto {
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
    holders: [...(record.holders ?? [])],
    holderTaxYear: record.holderTaxYear ?? null,
    processing: { ...processingOf(record, derived.drafts) },
    filledFields: filledFieldsOf(derived.drafts),
    duplicateOf: duplicateDto(derived.original),
  }
}

const NOTHING_DERIVED: DerivedReceiptFacts = { drafts: [] }

/** Application logic for the Beleg-Posteingang: userId-scoped reads/writes, encrypted binary storage, and derived-Zuordnung mapping. */
@Injectable()
export class ReceiptService {
  constructor(
    @Inject(RECEIPT_REPOSITORY) private readonly repository: ReceiptRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    /** The owl drafts carry the Beleg id: its processing state and its filled fields come from them (ADR-0097). */
    @Optional() @Inject(AdvisorService) private readonly advisor?: AdvisorService,
  ) {}

  /** The drafts of every tax year per Beleg; empty without the owl (a module that does not wire it). */
  private async draftsPerReceipt(userId: string): Promise<Map<string, ReceiptDraftRecord[]>> {
    return draftsByReceipt((await this.advisor?.receiptDrafts(userId)) ?? [])
  }

  /** Whether the Beleg exists and belongs to the caller (ownership check for parse/confirm). */
  async isOwnedBy(userId: string, id: string): Promise<boolean> {
    return (await this.repository.findByIdForUser(userId, id)) !== null
  }

  async list(userId: string): Promise<ReceiptResponseDto[]> {
    const rows = await this.repository.findAllForUser(userId)
    if (rows.length === 0) return []
    await this.auditService.append({ userId, action: 'READ', resource: 'beleg' })
    const [drafts, keys] = await Promise.all([this.draftsPerReceipt(userId), this.storage.listContentKeys(userId)])
    const originals = originalsByContent(rows, keys)
    return rows.map((row) => toReceiptResponse(row, { drafts: drafts.get(row.id) ?? [], original: originals.get(row.id) }))
  }

  async create(userId: string, dto: CreateReceiptDto): Promise<ReceiptResponseDto> {
    const record = await this.repository.create(userId, {
      fileName: dto.fileName,
      ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
      ...(dto.belegdatum !== undefined ? { belegdatum: dto.belegdatum } : {}),
      ...(dto.zahlungsdatum !== undefined ? { zahlungsdatum: dto.zahlungsdatum } : {}),
    })
    return toReceiptResponse(record, NOTHING_DERIVED)
  }

  async upload(userId: string, input: UploadReceiptInput): Promise<ReceiptResponseDto> {

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
      // Still stored when it repeats an older upload: the user may mean it; parsing it stages nothing twice.
      const original = await this.originalOf(userId, record.id)
      return toReceiptResponse(record, { ...NOTHING_DERIVED, original: original ?? undefined }, storedMeta)
    } catch (error) {
      await this.repository.deleteForUser(userId, record.id).catch(() => {})
      throw error
    }
  }

  /** The older Beleg of the same user with the same file content (ADR-0097 §7), or null. */
  async originalOf(userId: string, receiptId: string): Promise<ReceiptRecord | null> {
    const keys = await this.storage.listContentKeys(userId)
    if (!keys.some((k) => k.receiptId === receiptId)) return null
    const rows = await this.repository.findAllForUser(userId)
    return originalsByContent(rows, keys).get(receiptId) ?? null
  }

  async getFile(userId: string, id: string): Promise<DownloadedReceiptFile> {
    const record = await this.repository.findByIdForUser(userId, id)
    if (record === null) {
      throw new NotFoundError('BELEG_NOT_FOUND', `Beleg "${id}" does not exist for this account.`)
    }
    const stored = await this.storage.get(userId, id)
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
    const drafts = (await this.draftsPerReceipt(userId)).get(id) ?? []
    return toReceiptResponse(record, { drafts })
  }

  async delete(userId: string, id: string, options: DeleteReceiptOptions = {}): Promise<DeleteReceiptResponseDto> {
    const existing = await this.repository.findByIdForUser(userId, id)
    if (existing === null) {
      throw new NotFoundError('BELEG_NOT_FOUND', `Beleg "${id}" does not exist for this account.`)
    }
    const { takenBack, withdrawn } = options.takeBackValues === true ? await this.takeBack(userId, id) : { takenBack: 0, withdrawn: 0 }
    await this.storage.delete(userId, id)
    await this.repository.deleteForUser(userId, id)
    return { deleted: true, takenBack, withdrawn }
  }

  /**
   * Removes what the Beleg put into the return, in every tax year its drafts sit in (ADR-0097 §6): the same
   * take-back as giving a document to someone else (ADR-0092 §4) — a value changed since stays.
   */
  private async takeBack(userId: string, id: string): Promise<{ takenBack: number; withdrawn: number }> {
    if (this.advisor === undefined) return { takenBack: 0, withdrawn: 0 }
    const drafts = (await this.draftsPerReceipt(userId)).get(id) ?? []
    let takenBack = 0
    for (const taxYear of new Set(drafts.map((d) => d.taxYear))) takenBack += await this.advisor.takeBackDocumentValues(userId, taxYear, id)
    return { takenBack, withdrawn: drafts.filter((d) => d.status === 'pending').length }
  }
}
