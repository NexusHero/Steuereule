import { Inject, Injectable, Optional } from '@nestjs/common'
import { ISO_DATE_PATTERN, assignmentFromData, isReceiptType, receiptFolderOfKind, type ReceiptAssignment, type ReceiptFolder, type ReceiptType } from '@steuereule/core'
import { AdvisorDocumentStaging } from '../advisor/advisor-document-staging.js'
import type { ReceiptDraftRecord } from '../advisor/advisor.repository.js'
import { ConflictError, InvalidInputError, NotFoundError } from '../common/domain-error.js'
import { AuditService } from '../audit/audit.service.js'
import { draftsByReceipt, duplicateDto, filledFieldsOf, originalsByContent, processingOf } from './receipt-state.js'
import { RECEIPT_REPOSITORY, type ReceiptFacts, type ReceiptRecord, type ReceiptRepository } from './receipt.repository.js'
import { detectAllowedReceiptMimeType, type AllowedReceiptMimeType } from './storage/magic-bytes.js'
import { STORAGE_PORT, type StoragePort, type StoredReceiptMeta } from './storage/storage.port.js'
import type { DeleteReceiptResponseDto, ReceiptCountsDto, ReceiptPageResponseDto, ReceiptProposalDto, ReceiptResponseDto } from './dto/receipt-response.dto.js'
import type { CreateReceiptDto } from './dto/create-receipt.dto.js'
import type { SetAssignmentDto } from './dto/set-assignment.dto.js'
import type { AssignmentDto } from './dto/assignment.dto.js'

/**
 * What one account may store (ADR-0106 D7). Without a bound, one account stored 237 MB in 16 seconds into the
 * database's bytea storage. Several tax years of receipts stay far below it.
 */
export const MAX_RECEIPT_FILES_PER_ACCOUNT = 2_000
export const MAX_RECEIPT_BYTES_PER_ACCOUNT = 2 * 1024 * 1024 * 1024
// Beleg ROW cap (ADR-0108): the byte/file quota above bounds only stored blobs (ReceiptFile). A fileless
// `POST /v1/belege` makes a Receipt row with no file, so it escaped every bound — an authenticated account
// could grow rows without limit. Generous for real use (several tax years), finite against row flooding.
export const MAX_RECEIPTS_PER_ACCOUNT = 5_000

function exceedsReceiptQuota(files: number, bytes: number): boolean {
  return files > MAX_RECEIPT_FILES_PER_ACCOUNT || bytes > MAX_RECEIPT_BYTES_PER_ACCOUNT
}

function receiptQuotaExceeded(): ConflictError {
  return new ConflictError(
    'RECEIPT_QUOTA_EXCEEDED',
    'Dein Speicherplatz für Belege ist voll. Lösche Belege, die du nicht mehr brauchst, und versuche es dann erneut.',
  )
}

export interface UploadReceiptInput {
  readonly buffer: Buffer
  readonly fileName: string
  readonly kind?: string | undefined
  readonly belegdatum?: string | undefined
  readonly zahlungsdatum?: string | undefined
  /** A business receipt (ADR-0101 §6): `ausgabe` or `einnahme`; files the Beleg as a Geschäftsbeleg. */
  readonly direction?: string | undefined
  /** The user's assistant that uploads it over MCP (its OAuth client id), so that it alone may take it back. */
  readonly uploadedByClientId?: string | undefined
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
    direction: record.direction ?? null,
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

/** The cursor is the position of the last Beleg on the page; opaque to the caller. */
function encodeReceiptCursor(row: Pick<ReceiptRecord, 'createdAt' | 'id'>): string {
  return Buffer.from(JSON.stringify({ t: row.createdAt.toISOString(), i: row.id })).toString('base64url')
}

function decodeReceiptCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { t?: unknown; i?: unknown }
    const createdAt = typeof parsed.t === 'string' ? new Date(parsed.t) : null
    if (createdAt !== null && !Number.isNaN(createdAt.getTime()) && typeof parsed.i === 'string' && parsed.i !== '') return { createdAt, id: parsed.i }
  } catch {
    // falls through to the refusal below
  }
  throw new InvalidInputError('RECEIPT_CURSOR_INVALID', 'Der Cursor ist ungültig.')
}

/** What the inbox shows beside the page, counted over every Beleg (the screen counted over the whole list before). */
function countsOf(facts: readonly ReceiptFacts[], drafts: ReadonlyMap<string, ReceiptDraftRecord[]>): ReceiptCountsDto {
  const folders = { einkuenfte: 0, vorsorge: 0, bescheide: 0, weitere: 0 }
  const proposals: ReceiptProposalDto[] = []
  let open = 0
  let unassigned = 0
  for (const fact of facts) {
    folders[receiptFolderOfKind(fact.kind)] += 1
    if (processingOf(fact, drafts.get(fact.id) ?? []).open) open += 1
    const assignment = assignmentFromData(fact)
    if (assignment.kind !== 'zugeordnet') unassigned += 1
    if (assignment.kind === 'vorgeschlagen') proposals.push({ id: fact.id, taxYear: assignment.proposal.taxYear })
  }
  return { total: facts.length, open, unassigned, folders, proposals }
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
    @Optional() @Inject(AdvisorDocumentStaging) private readonly staging?: AdvisorDocumentStaging,
  ) {}

  /** The drafts of every tax year per Beleg; empty without the owl (a module that does not wire it). */
  private async draftsPerReceipt(userId: string): Promise<Map<string, ReceiptDraftRecord[]>> {
    return draftsByReceipt((await this.staging?.receiptDrafts(userId)) ?? [])
  }

  /** Whether the Beleg exists and belongs to the caller (ownership check for parse/confirm). */
  async isOwnedBy(userId: string, id: string): Promise<boolean> {
    return (await this.repository.findByIdForUser(userId, id)) !== null
  }

  /** The caller's own Beleg as stored, or null (the MCP take-back reads who uploaded it). */
  findOwn(userId: string, id: string): Promise<ReceiptRecord | null> {
    return this.repository.findByIdForUser(userId, id)
  }

  async list(userId: string): Promise<ReceiptResponseDto[]> {
    const rows = await this.repository.findAllForUser(userId)
    if (rows.length === 0) return []
    await this.auditService.append({ userId, action: 'READ', resource: 'beleg' })
    const [drafts, keys] = await Promise.all([this.draftsPerReceipt(userId), this.storage.listContentKeys(userId)])
    const originals = originalsByContent(rows, keys)
    return rows.map((row) => toReceiptResponse(row, { drafts: drafts.get(row.id) ?? [], original: originals.get(row.id) }))
  }

  /**
   * One page of the inbox with the counts the screen shows. The counts come from the light facts of every
   * Beleg (no file name to decrypt, no file joined); only the page itself is read in full and enriched.
   */
  async listPage(userId: string, query: { readonly limit: number; readonly cursor?: string | undefined; readonly folder?: ReceiptFolder | undefined }): Promise<ReceiptPageResponseDto> {
    const after = query.cursor === undefined ? undefined : decodeReceiptCursor(query.cursor)
    const facts = await this.repository.listFactsForUser(userId)
    if (facts.length === 0) return { items: [], nextCursor: null, counts: countsOf([], new Map()) }
    // The audit row joins the reads: one round instead of two (OPS-4).
    const [drafts, keys, rows] = await Promise.all([
      this.draftsPerReceipt(userId),
      this.storage.listContentKeys(userId),
      this.repository.findPageForUser(userId, { limit: query.limit + 1, ...(after ? { after } : {}), ...(query.folder ? { folder: query.folder } : {}) }),
      this.auditService.append({ userId, action: 'READ', resource: 'beleg' }),
    ])
    const page = rows.slice(0, query.limit)
    const last = page[page.length - 1]
    const originals = originalsByContent(facts, keys)
    const originalRecords = await this.originalRecords(userId, page, originals)
    return {
      items: page.map((row) => {
        const original = originals.get(row.id)
        return toReceiptResponse(row, { drafts: drafts.get(row.id) ?? [], original: original ? originalRecords.get(original.id) : undefined })
      }),
      nextCursor: rows.length > query.limit && last ? encodeReceiptCursor(last) : null,
      counts: countsOf(facts, drafts),
    }
  }

  /** The older uploads the page's duplicates point at; the ones already on the page are not read again. */
  private async originalRecords(userId: string, page: readonly ReceiptRecord[], originals: ReadonlyMap<string, { readonly id: string }>): Promise<Map<string, ReceiptRecord>> {
    const known = new Map(page.map((row) => [row.id, row]))
    const wanted = [...new Set(page.flatMap((row) => originals.get(row.id)?.id ?? []))].filter((id) => !known.has(id))
    for (const row of await this.repository.findManyByIdsForUser(userId, wanted)) known.set(row.id, row)
    return known
  }

  async create(userId: string, dto: CreateReceiptDto): Promise<ReceiptResponseDto> {
    const record = await this.repository.create(userId, {
      fileName: dto.fileName,
      ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
      ...(dto.belegdatum !== undefined ? { belegdatum: dto.belegdatum } : {}),
      ...(dto.zahlungsdatum !== undefined ? { zahlungsdatum: dto.zahlungsdatum } : {}),
    }, MAX_RECEIPTS_PER_ACCOUNT)
    if (record === null) throw receiptQuotaExceeded()
    return toReceiptResponse(record, NOTHING_DERIVED)
  }

  async upload(userId: string, input: UploadReceiptInput): Promise<ReceiptResponseDto> {

    const mimeType = detectAllowedReceiptMimeType(input.buffer)
    const cleanFileName = input.fileName.trim().slice(0, 255) || 'beleg'
    const kind = assertReceiptTypeOrUndefined(input.kind)
    const belegdatum = assertIsoDateOrUndefined(input.belegdatum, 'belegdatum')
    const zahlungsdatum = assertIsoDateOrUndefined(input.zahlungsdatum, 'zahlungsdatum')
    const direction = input.direction === undefined || input.direction === '' ? undefined : input.direction
    if (direction !== undefined && direction !== 'ausgabe' && direction !== 'einnahme') {
      throw new InvalidInputError('RECEIPT_DIRECTION_INVALID', '"direction" ist "ausgabe" oder "einnahme".')
    }
    // A direction makes it a business receipt: it is read into a booking draft (ADR-0101 §6).
    const fileAs = kind ?? (direction !== undefined ? ('Geschaeftsbeleg' as const) : undefined)

    // Checked before the write to refuse early, and again after it: concurrent uploads may all pass the first
    // check, and the second one, which counts the file just stored, takes back whatever went over the cap.
    const usage = await this.storage.usage(userId)
    if (exceedsReceiptQuota(usage.files + 1, usage.bytes + input.buffer.length)) throw receiptQuotaExceeded()

    const record = await this.repository.create(userId, {
      fileName: cleanFileName,
      ...(fileAs !== undefined ? { kind: fileAs } : {}),
      ...(direction !== undefined ? { direction } : {}),
      ...(belegdatum !== undefined ? { belegdatum } : {}),
      ...(zahlungsdatum !== undefined ? { zahlungsdatum } : {}),
      ...(input.uploadedByClientId !== undefined ? { uploadedByClientId: input.uploadedByClientId } : {}),
    }, MAX_RECEIPTS_PER_ACCOUNT)
    if (record === null) throw receiptQuotaExceeded()

    try {
      const storedMeta = await this.storage.put({
        userId,
        receiptId: record.id,
        buffer: input.buffer,
        mimeType,
      })
      const after = await this.storage.usage(userId)
      if (exceedsReceiptQuota(after.files, after.bytes)) {
        await this.storage.delete(userId, record.id).catch(() => false)
        throw receiptQuotaExceeded()
      }
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
    if (this.staging === undefined) return { takenBack: 0, withdrawn: 0 }
    const drafts = (await this.draftsPerReceipt(userId)).get(id) ?? []
    let takenBack = 0
    for (const taxYear of new Set(drafts.map((d) => d.taxYear))) takenBack += await this.staging.takeBackDocumentValues(userId, taxYear, id)
    return { takenBack, withdrawn: drafts.filter((d) => d.status === 'pending').length }
  }
}
