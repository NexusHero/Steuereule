// In-memory fake keyed by `${userId}::${steuerjahr}` — mirrors FakeProfileRepository's
// approach so round-trip and cross-user/cross-year isolation are genuinely exercised,
// not just echoed back (ADR-0004).
import type { TaxYearRecord, TaxYearRepository } from '../../src/cockpit/tax-year.repository.js'

function key(userId: string, steuerjahr: number): string {
  return `${userId}::${steuerjahr}`
}

export class FakeTaxYearRepository implements TaxYearRepository {
  private readonly store = new Map<string, TaxYearRecord>()

  findByUserAndYear(userId: string, steuerjahr: number): Promise<TaxYearRecord | null> {
    return Promise.resolve(this.store.get(key(userId, steuerjahr)) ?? null)
  }

  seed(userId: string, record: TaxYearRecord): void {
    this.store.set(key(userId, record.steuerjahr), record)
  }

  recordCount(): number {
    return this.store.size
  }
}
