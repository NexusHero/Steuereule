import { Inject, Injectable, Optional } from '@nestjs/common'
import { STORAGE_PORT, type StoragePort } from '../receipt/storage/storage.port.js'
import type { AuditLogRow } from '../audit/audit.repository.js'
import { AuditService } from '../audit/audit.service.js'
import { PROFILE_REPOSITORY, type ProfileRepository } from '../profile/profile.repository.js'
import { ACCOUNT_IDENTITY_REPOSITORY, type AccountIdentityRepository } from './account-identity.repository.js'
import type { ExportAccessLogEntry, ExportDocument, ExportReceiptFile } from './export/export-document.js'
import { buildExportReportHtml } from './export/export-report-template.js'
import { PDF_RENDERER, type PdfRenderer } from './export/pdf-renderer.js'
import { TAX_DATA_EXPORT_REPOSITORY, type TaxDataExportRepository } from './tax-data-export.repository.js'

/**
 * The PDF report shows the newest this-many access-log entries: it is read by a person, and thousands of table
 * rows only cost the renderer memory and time. The JSON export keeps the whole log (Art. 15/20 DSGVO, ADR-0109).
 */
export const PDF_ACCESS_LOG_ENTRIES = 1000

/** Rows read from the database, and written to the response, at a time in the JSON export. */
export const EXPORT_ACCESS_LOG_BATCH = 1000

export type ExportHead = Omit<ExportDocument, 'accessLog' | 'accessLogNewestOnly' | 'receiptFiles'> & { receiptFiles: ExportReceiptFile[] }

const toExportEntry = (row: AuditLogRow): ExportAccessLogEntry => ({
  action: row.action,
  resource: row.resource,
  ...(row.source ? { source: row.source } : {}),
  createdAt: row.createdAt.toISOString(),
})

/**
 * The export as JSON text: the head, then the original receipt files one at a time, then the access log batch by
 * batch. Same bytes as `JSON.stringify` of the whole document with `receiptFiles` and `accessLog` as its last keys,
 * but never more than one file or one batch of the log in memory (ADR-0109).
 */
export async function* streamExportJson(
  head: Omit<ExportHead, 'receiptFiles'>,
  files: AsyncIterable<ExportReceiptFile>,
  batches: AsyncIterable<AuditLogRow[]>,
): AsyncGenerator<string> {
  yield `${JSON.stringify(head).slice(0, -1)},"receiptFiles":[`
  let firstFile = true
  for await (const file of files) {
    yield (firstFile ? '' : ',') + JSON.stringify(file)
    firstFile = false
  }
  yield '],"accessLog":['
  let first = true
  for await (const batch of batches) {
    if (batch.length === 0) continue
    yield (first ? '' : ',') + batch.map((row) => JSON.stringify(toExportEntry(row))).join(',')
    first = false
  }
  yield ']}'
}

/** Assembles the DSGVO export document exactly once. */
@Injectable()
export class AccountExportService {
  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly profileRepository: ProfileRepository,
    @Inject(ACCOUNT_IDENTITY_REPOSITORY) private readonly accountIdentityRepository: AccountIdentityRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PDF_RENDERER) private readonly pdfRenderer: PdfRenderer,
    @Inject(TAX_DATA_EXPORT_REPOSITORY) private readonly taxDataExportRepository: TaxDataExportRepository,
    /** Decrypts the original receipt files for the JSON export (H2-6); absent in tests without receipts. */
    @Optional() @Inject(STORAGE_PORT) private readonly files?: Pick<StoragePort, 'get'>,
  ) {}

  async assemble(userId: string, options: { accessLogNewest?: number } = {}): Promise<ExportDocument | null> {
    const limit = options.accessLogNewest
    const head = await this.assembleHead(userId)
    if (!head) return null
    // One more than shown, to know whether the PDF leaves entries out.
    const accessLog = await this.auditService.findOwnRows(userId, limit === undefined ? {} : { newest: limit + 1 })
    return {
      ...head,
      ...(limit !== undefined && accessLog.length > limit ? { accessLogNewestOnly: limit } : {}),
      accessLog: (limit === undefined ? accessLog : accessLog.slice(-limit)).map(toExportEntry),
    }
  }

  /** The complete JSON export as a stream; the access log is read in keyset batches (ADR-0109). */
  async assembleJsonStream(userId: string): Promise<{ exportedAt: string; chunks: AsyncGenerator<string> } | null> {
    const head = await this.assembleHead(userId)
    if (!head) return null
    // Rows up to now: the READ entry of this export itself is written after, as before.
    const batches = this.auditService.streamOwnRows(userId, { batchSize: EXPORT_ACCESS_LOG_BATCH, before: new Date(head.exportedAt) })
    const { receiptFiles, ...rest } = head
    return { exportedAt: head.exportedAt, chunks: streamExportJson(rest, this.readFiles(userId, receiptFiles), batches) }
  }

  /** One decrypted file at a time, so a 2 GiB account never sits in memory at once. */
  private async *readFiles(userId: string, files: readonly ExportReceiptFile[]): AsyncGenerator<ExportReceiptFile> {
    for (const file of files) {
      const stored = this.files ? await this.files.get(userId, file.receiptId) : null
      yield stored ? { ...file, contentBase64: stored.buffer.toString('base64') } : file
    }
  }

  private async assembleHead(userId: string): Promise<ExportHead | null> {
    const account = await this.accountIdentityRepository.findByUserId(userId)
    if (!account) return null
    const [profileRecord, taxData, accountData, receiptFiles] = await Promise.all([
      this.profileRepository.findByUserId(userId),
      this.taxDataExportRepository.findAllForUser(userId),
      this.taxDataExportRepository.findAccountDataForUser(userId),
      this.taxDataExportRepository.listReceiptFiles(userId),
    ])
    return {
      schemaVersion: '1.0',
      exportedAt: new Date().toISOString(),
      account: {
        email: account.email,
        name: account.name,
        emailVerified: account.emailVerified,
        createdAt: account.createdAt.toISOString(),
        authProviders: account.authProviders,
      },
      profile: profileRecord
        ? {
            firstName: profileRecord.firstName,
            lastName: profileRecord.lastName,
            steuerId: profileRecord.steuerId,
            steuernummer: profileRecord.steuernummer,
            createdAt: (profileRecord.createdAt ?? new Date()).toISOString(),
            updatedAt: (profileRecord.updatedAt ?? new Date()).toISOString(),
          }
        : null,
      taxData,
      accountData,
      receiptFiles,
    }
  }

  renderPdf(document: ExportDocument): Promise<Buffer> {
    return this.pdfRenderer.renderPdf(buildExportReportHtml(document))
  }

  recordExportRead(userId: string): Promise<void> {
    return this.auditService.append({ userId, action: 'READ', resource: 'export' })
  }
}
