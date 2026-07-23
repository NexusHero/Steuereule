// Assembles the DSGVO export document exactly once (ADR-0013 §4): the caller's
// decrypted Profile (reusing the existing ProfileRepository seam directly — never
// re-implementing its decrypt+integrity check, and never going through ProfileService
// so this path doesn't double-append its "profile" READ entry), the caller's own
// TaxDataAccessLog rows (via AuditService.findOwnRows), and better-auth account
// identity — then hands the identical object to either representation: verbatim as
// JSON, or through the PDF-Bericht template (export-report-template.ts). One data
// path, two renderings; secrets never enter ExportDocument in the first place (see
// export/export-document.ts).
import { Inject, Injectable } from '@nestjs/common'
import { AuditService } from '../audit/audit.service.js'
import { PROFILE_REPOSITORY, type ProfileRepository } from '../profile/profile.repository.js'
import { ACCOUNT_IDENTITY_REPOSITORY, type AccountIdentityRepository } from './account-identity.repository.js'
import type { ExportDocument } from './export/export-document.js'
import { buildExportReportHtml } from './export/export-report-template.js'
import { PDF_RENDERER, type PdfRenderer } from './export/pdf-renderer.js'

@Injectable()
export class AccountExportService {
  // Explicit tokens — see the comment on ProfileController's constructor.
  constructor(
    @Inject(PROFILE_REPOSITORY) private readonly profileRepository: ProfileRepository,
    @Inject(ACCOUNT_IDENTITY_REPOSITORY) private readonly accountIdentityRepository: AccountIdentityRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PDF_RENDERER) private readonly pdfRenderer: PdfRenderer,
  ) {}

  /**
   * Assembles the export document for `userId`, or `null` when the caller has no
   * better-auth account yet (a guest session that never signed up — ADR-0013's
   * contract describes "a signed-in account holder"; there is nothing yet to export).
   * Does NOT append the export's own READ audit entry — see recordExportRead, called
   * only once the caller's actual representation has been decided/rendered.
   */
  async assemble(userId: string): Promise<ExportDocument | null> {
    const account = await this.accountIdentityRepository.findByUserId(userId)
    if (!account) return null

    const [profileRecord, accessLog] = await Promise.all([
      this.profileRepository.findByUserId(userId),
      this.auditService.findOwnRows(userId),
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
            // findByUserId's real (Prisma) implementation always populates these on a
            // read — see profile.repository.prisma.ts's toRecord(). The `?? new
            // Date()` fallback only guards a hand-built test double that omits them;
            // it never masks a real gap against Postgres.
            createdAt: (profileRecord.createdAt ?? new Date()).toISOString(),
            updatedAt: (profileRecord.updatedAt ?? new Date()).toISOString(),
          }
        : null,
      taxData: [],
      accessLog: accessLog.map((row) => ({
        action: row.action,
        resource: row.resource,
        createdAt: row.createdAt.toISOString(),
      })),
    }
  }

  renderPdf(document: ExportDocument): Promise<Buffer> {
    return this.pdfRenderer.renderPdf(buildExportReportHtml(document))
  }

  /** Appends the one `READ`/`export` audit entry both format branches share (ADR-0013 §4). */
  recordExportRead(userId: string): Promise<void> {
    return this.auditService.append({ userId, action: 'READ', resource: 'export' })
  }
}
