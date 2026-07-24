// The persistence seam for the export data assembly (ADR-0013 §4, REQ-011).
// ExportService depends on this interface, not on Prisma directly — same seam
// pattern as ProfileRepository/AuditRepository, enabling unit-test fakes that
// honour the real data shape without hitting a database.

export interface ExportProfileRecord {
  firstName: string
  lastName: string
  steuerId: string
  steuernummer: string | null
  createdAt: Date
  updatedAt: Date
}

export interface ExportAccountRecord {
  email: string
  name: string
  emailVerified: boolean
  createdAt: Date
  authProviders: string[]
}

export interface ExportAccessLogEntry {
  action: string
  resource: string
  createdAt: Date
}

export interface ExportData {
  profile: ExportProfileRecord | null
  account: ExportAccountRecord
  accessLog: ExportAccessLogEntry[]
}

export const EXPORT_REPOSITORY = Symbol('EXPORT_REPOSITORY')

export interface ExportRepository {
  /** Assembles all exportable data for the given userId. Profile is null when none exists. */
  assembleExportData(userId: string): Promise<ExportData>
}
