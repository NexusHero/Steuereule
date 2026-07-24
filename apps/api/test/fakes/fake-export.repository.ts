// In-memory fake that honours the ExportRepository contract — returns synthetic export
// data keyed by userId. Supports null profile (honest empty state) and the full shape
// per ADR-0013 §4 (no secrets, own audit log only, honest empty taxData).
import type { ExportData, ExportRepository } from '../../src/export/export.repository.js'

export class FakeExportRepository implements ExportRepository {
  private readonly store = new Map<string, ExportData>()

  seed(userId: string, data: ExportData): void {
    this.store.set(userId, data)
  }

  assembleExportData(userId: string): Promise<ExportData> {
    const data = this.store.get(userId)
    if (!data) {
      return Promise.reject(new Error(`ExportRepository: User ${userId} not found — export requires an existing account.`))
    }
    return Promise.resolve(data)
  }
}
