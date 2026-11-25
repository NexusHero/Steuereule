import type { ExportTaxDataEntry } from '../../src/account/export/export-document.js'
import type { ExportReceiptFileMeta, TaxDataExportRepository } from '../../src/account/tax-data-export.repository.js'

export class FakeTaxDataExportRepository implements TaxDataExportRepository {
  private readonly entries = new Map<string, ExportTaxDataEntry[]>()

  seed(userId: string, entries: ExportTaxDataEntry[]): void {
    this.entries.set(userId, entries)
  }

  async findAllForUser(userId: string): Promise<ExportTaxDataEntry[]> {
    return this.entries.get(userId) ?? []
  }

  async findAccountDataForUser(): Promise<ExportTaxDataEntry[]> {
    return []
  }

  async listReceiptFiles(): Promise<ExportReceiptFileMeta[]> {
    return []
  }
}
