import { Inject, Injectable } from '@nestjs/common'
import { AuditService } from '../audit/audit.service.js'
import { PROFILE_REPOSITORY, type ProfileRepository } from '../profile/profile.repository.js'
import { ACCOUNT_IDENTITY_REPOSITORY, type AccountIdentityRepository } from './account-identity.repository.js'
import type { ExportDocument } from './export/export-document.js'
import { buildExportReportHtml } from './export/export-report-template.js'
import { PDF_RENDERER, type PdfRenderer } from './export/pdf-renderer.js'
import { TAX_DATA_EXPORT_REPOSITORY, type TaxDataExportRepository } from './tax-data-export.repository.js'

/**
 * The PDF report shows the newest this-many access-log entries: it is read by a person, and thousands of table
 * rows only cost the renderer memory and time. The JSON export keeps the whole log (Art. 15/20 DSGVO, ADR-0109).
 */
export const PDF_ACCESS_LOG_ENTRIES = 1000

/** Assembles the DSGVO export document exactly once. */
@Injectable()
export class AccountExportService {
  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly profileRepository: ProfileRepository,
    @Inject(ACCOUNT_IDENTITY_REPOSITORY) private readonly accountIdentityRepository: AccountIdentityRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PDF_RENDERER) private readonly pdfRenderer: PdfRenderer,
    @Inject(TAX_DATA_EXPORT_REPOSITORY) private readonly taxDataExportRepository: TaxDataExportRepository,
  ) {}

  async assemble(userId: string, options: { accessLogNewest?: number } = {}): Promise<ExportDocument | null> {
    const account = await this.accountIdentityRepository.findByUserId(userId)
    if (!account) return null
    const limit = options.accessLogNewest

    const [profileRecord, accessLog, taxData] = await Promise.all([
      this.profileRepository.findByUserId(userId),
      // One more than shown, to know whether the PDF leaves entries out.
      this.auditService.findOwnRows(userId, limit === undefined ? {} : { newest: limit + 1 }),
      this.taxDataExportRepository.findAllForUser(userId),
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
      ...(limit !== undefined && accessLog.length > limit ? { accessLogNewestOnly: limit } : {}),
      accessLog: (limit === undefined ? accessLog : accessLog.slice(-limit)).map((row) => ({
        action: row.action,
        resource: row.resource,
        ...(row.source ? { source: row.source } : {}),
        createdAt: row.createdAt.toISOString(),
      })),
    }
  }

  renderPdf(document: ExportDocument): Promise<Buffer> {
    return this.pdfRenderer.renderPdf(buildExportReportHtml(document))
  }

  recordExportRead(userId: string): Promise<void> {
    return this.auditService.append({ userId, action: 'READ', resource: 'export' })
  }
}
