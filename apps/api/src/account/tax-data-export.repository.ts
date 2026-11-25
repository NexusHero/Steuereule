import type { ExportTaxDataEntry } from './export/export-document.js'

export const TAX_DATA_EXPORT_REPOSITORY = Symbol('TAX_DATA_EXPORT_REPOSITORY')

/** A stored receipt file as the export lists it before it reads the bytes. */
export interface ExportReceiptFileMeta {
  receiptId: string
  fileName: string
  mimeType: string
  byteLength: number
  uploadedAt: string
}

/** Read seam for the DSGVO export; which tables it reads comes from `personal-data-registry.ts`. */
export interface TaxDataExportRepository {
  findAllForUser(userId: string): Promise<ExportTaxDataEntry[]>
  /** Sessions, 2FA status, passkeys, device logins, assistants, legal holds (API-17). */
  findAccountDataForUser(userId: string): Promise<ExportTaxDataEntry[]>
  listReceiptFiles(userId: string): Promise<ExportReceiptFileMeta[]>
}
