import type { ExportTaxDataEntry } from './export/export-document.js'

export const TAX_DATA_EXPORT_REPOSITORY = Symbol('TAX_DATA_EXPORT_REPOSITORY')

/** Read seam for the tax-data half of the DSGVO export. */
export interface TaxDataExportRepository {
  findAllForUser(userId: string): Promise<ExportTaxDataEntry[]>
}
