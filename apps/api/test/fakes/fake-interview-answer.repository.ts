// In-memory fake keyed by `${userId}::${steuerjahr}` — mirrors FakeTaxYearRepository's
// approach so round-trip and cross-user/cross-year isolation are genuinely exercised,
// not just echoed back (ADR-0004). `write()` mirrors the real repository's contract
// (idempotent upsert on questionId) without a database.
import type { InterviewAnswerRecord, InterviewAnswerRepository, WriteAnswerParams } from '../../src/interview/interview-answer.repository.js'

function key(userId: string, steuerjahr: number): string {
  return `${userId}::${steuerjahr}`
}

export class FakeInterviewAnswerRepository implements InterviewAnswerRepository {
  private readonly store = new Map<string, Map<string, string>>()
  /** Every write() call in order — lets a test assert "no row created" precisely. */
  readonly writes: WriteAnswerParams[] = []

  findAllForUserAndYear(userId: string, steuerjahr: number): Promise<InterviewAnswerRecord[]> {
    const rows = this.store.get(key(userId, steuerjahr))
    if (!rows) return Promise.resolve([])
    return Promise.resolve([...rows.entries()].map(([questionId, value]) => ({ questionId, value })))
  }

  write(params: WriteAnswerParams): Promise<void> {
    this.writes.push(params)
    const k = key(params.userId, params.steuerjahr)
    const rows = this.store.get(k) ?? new Map<string, string>()
    rows.set(params.questionId, params.value)
    this.store.set(k, rows)
    return Promise.resolve()
  }

  /** Test seam: seed answers directly, bypassing write()'s admission side-effects. */
  seed(userId: string, steuerjahr: number, answers: Record<string, string>): void {
    const rows = this.store.get(key(userId, steuerjahr)) ?? new Map<string, string>()
    for (const [questionId, value] of Object.entries(answers)) rows.set(questionId, value)
    this.store.set(key(userId, steuerjahr), rows)
  }

  recordCount(): number {
    let count = 0
    for (const rows of this.store.values()) count += rows.size
    return count
  }
}
