// In-memory fake of the frozen filing versions (ADR-0098 §8): latest version per (userId, year).
import type { FilingVersionRecord, FilingVersionRepository } from '../../src/assessment/filing-version.repository.js'

export class FakeFilingVersionRepository implements FilingVersionRepository {
  private readonly rows: FilingVersionRecord[] = []

  seed(record: FilingVersionRecord): void {
    this.rows.push(record)
  }

  findLatest(userId: string, taxYear: number): Promise<FilingVersionRecord | null> {
    const own = this.rows.filter((r) => r.userId === userId && r.taxYear === taxYear).sort((a, b) => b.number - a.number)
    return Promise.resolve(own[0] ?? null)
  }

  async listLatestForUser(userId: string): Promise<FilingVersionRecord[]> {
    const years = [...new Set(this.rows.filter((r) => r.userId === userId).map((r) => r.taxYear))].sort((a, b) => a - b)
    return (await Promise.all(years.map((y) => this.findLatest(userId, y)))).filter((r): r is FilingVersionRecord => r !== null)
  }
}
