// The persistence seam for InterviewAnswer. InterviewService depends on this
// interface, not on Prisma directly, so unit tests can swap in a fake that still
// honours the real per-(userId, steuerjahr, questionId) uniqueness constraint
// (ADR-0004: no mocking Prisma into meaninglessness) — mirrors ProfileRepository.
export interface InterviewAnswerRecord {
  questionId: string
  value: string
}

export interface WriteAnswerParams {
  userId: string
  steuerjahr: number
  questionId: string
  value: string
  /**
   * The recomputed remainingSteps() count after this write — the ONE place
   * TaxYear.openItems is written from (packages/core's remainingSteps(), #318).
   * The repository does not compute this itself; InterviewService does, from
   * @steuereule/core, so the write side never re-derives the counting rule.
   */
  openItems: number
}

export const INTERVIEW_ANSWER_REPOSITORY = Symbol('INTERVIEW_ANSWER_REPOSITORY')

export interface InterviewAnswerRepository {
  /** All stored answers/gate-acknowledgements for this userId+steuerjahr, unordered. */
  findAllForUserAndYear(userId: string, steuerjahr: number): Promise<InterviewAnswerRecord[]>
  /**
   * Idempotent upsert of one answer row, scoped to (userId, steuerjahr, questionId) —
   * the same payload written twice yields the same stored state. Also appends the
   * row's WRITE audit entry (ADR-0008) and writes the TaxYear.openItems projection,
   * atomically with the answer row itself.
   */
  write(params: WriteAnswerParams): Promise<void>
}
