// Application logic: assembles the export document once from the repository, then
// renders it as JSON or PDF depending on the requested format (ADR-0013 §4).
// Single data path, two renderings — no duplicated assembly logic.
// Trusts that userId was produced by UserContextGuard (ADR-0007).
// Appends a READ audit entry (resource: "export") before the response is sent.

import { Inject, Injectable } from '@nestjs/common'
import { AuditService } from '../audit/audit.service.js'
import { EXPORT_REPOSITORY, type ExportData, type ExportRepository } from './export.repository.js'
import { PDF_RENDERER, type PdfRenderer } from './pdf-renderer.js'
import type {
  ExportAccountDto,
  ExportAccessLogEntryDto,
  ExportJsonResponseDto,
  ExportProfileDto,
} from './dto/export.dto.js'

export type ExportFormat = 'json' | 'pdf'

export interface ExportResult {
  contentType: string
  filename: string
  body: Buffer | ExportJsonResponseDto
}

@Injectable()
export class ExportService {
  constructor(
    @Inject(EXPORT_REPOSITORY) private readonly repository: ExportRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(PDF_RENDERER) private readonly pdfRenderer: PdfRenderer,
  ) {}

  async exportData(userId: string, format: ExportFormat): Promise<ExportResult> {
    const data = await this.repository.assembleExportData(userId)
    const exportedAt = new Date()
    const dateStr = exportedAt.toISOString().slice(0, 10)

    // Append READ audit entry (ADR-0013 §4: every export is logged)
    await this.auditService.append({ userId, action: 'READ', resource: 'export' })

    if (format === 'pdf') {
      const pdfBuffer = await this.pdfRenderer.renderPdf(data, exportedAt)
      return {
        contentType: 'application/pdf',
        filename: `steuereule-export-${dateStr}.pdf`,
        body: pdfBuffer,
      }
    }

    // JSON branch (default)
    return {
      contentType: 'application/json',
      filename: `steuereule-export-${dateStr}.json`,
      body: toJsonResponse(data, exportedAt),
    }
  }
}

/** Maps the raw ExportData to the ADR-0013 §4 JSON shape. */
function toJsonResponse(data: ExportData, exportedAt: Date): ExportJsonResponseDto {
  return {
    schemaVersion: '1.0',
    exportedAt: exportedAt.toISOString(),
    account: toAccountDto(data.account),
    profile: data.profile ? toProfileDto(data.profile) : null,
    // Honest empty set — no tax-year model exists yet (ADR-0013 §4, §8)
    taxData: [],
    accessLog: data.accessLog.map(toAccessLogEntryDto),
  }
}

function toAccountDto(record: ExportData['account']): ExportAccountDto {
  return {
    email: record.email,
    name: record.name,
    emailVerified: record.emailVerified,
    createdAt: record.createdAt.toISOString(),
    // Deduplicate: a user may have multiple Account rows with the same providerId
    // (e.g. re-linked credentials). The export lists unique provider names.
    authProviders: [...new Set(record.authProviders)],
  }
}

function toProfileDto(record: NonNullable<ExportData['profile']>): ExportProfileDto {
  return {
    firstName: record.firstName,
    lastName: record.lastName,
    steuerId: record.steuerId,
    steuernummer: record.steuernummer,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

function toAccessLogEntryDto(entry: ExportData['accessLog'][number]): ExportAccessLogEntryDto {
  return {
    action: entry.action,
    resource: entry.resource,
    createdAt: entry.createdAt.toISOString(),
  }
}
