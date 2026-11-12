import { ENTRIES, QUESTIONS, type EntryId, type EntryStepId } from './interview'

export interface QuestionLocation {
  /** The catalogue entry (page of the interview) the question belongs to. */
  readonly entry: EntryId
  /** The step of that entry that is asked first on the way to the question: itself, or the one whose answer leads to it. */
  readonly step: EntryStepId
}

const targetStep = (target: string | { readonly step: string }): EntryStepId => (typeof target === 'string' ? target : target.step) as EntryStepId

/**
 * Where a question of the interview is asked (#488): which entry, and which of its steps opens the
 * way to it. A follow-up such as `spenden-betrag` belongs to `spenden`, which belongs to
 * `sonderausgaben`. Null for a question no entry asks.
 */
export function locateQuestion(questionId: string): QuestionLocation | null {
  for (const entry of Object.values(ENTRIES)) {
    for (const root of entry.steps) {
      const seen = new Set<EntryStepId>()
      const reaches = (step: EntryStepId): boolean => {
        if (step === questionId) return true
        if (seen.has(step)) return false
        seen.add(step)
        const declaration = QUESTIONS[step]
        const targets = [...Object.values(declaration?.followUps ?? {}).flat(), ...(declaration?.defaultFollowUp ?? [])]
        return targets.some((target) => reaches(targetStep(target)))
      }
      if (reaches(root)) return { entry: entry.id, step: root }
    }
  }
  return null
}
