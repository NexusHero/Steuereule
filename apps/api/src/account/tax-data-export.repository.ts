// Read seam for the tax-data half of the DSGVO export (Art. 15/20). One entry per
// stored row, decrypted, so the data subject receives their figures, not ciphertext.
import type { ExportTaxDataEntry } from './export/export-document.js'

export const TAX_DATA_EXPORT_REPOSITORY = Symbol('TAX_DATA_EXPORT_REPOSITORY')

export interface TaxDataExportRepository {
  /** Every tax-data row the caller owns, oldest tax year first; [] when there are none. */
  findAllForUser(userId: string): Promise<ExportTaxDataEntry[]>
}
