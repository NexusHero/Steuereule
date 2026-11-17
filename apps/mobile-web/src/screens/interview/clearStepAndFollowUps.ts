import { QUESTIONS, type Answers, type EntryStepId } from '@steuereule/core'

function collectFollowUpStepIds(stepId: EntryStepId, acc = new Set<EntryStepId>()): ReadonlySet<EntryStepId> {
  if (acc.has(stepId)) return acc
  acc.add(stepId)
  const decl = QUESTIONS[stepId]
  if (decl.followUps !== undefined) {
    for (const branch of Object.values(decl.followUps)) {
      for (const target of branch) {
        const id = typeof target === 'string' ? target : target.step
        collectFollowUpStepIds(id, acc)
      }
    }
  }
  if (decl.defaultFollowUp !== undefined) {
    for (const target of decl.defaultFollowUp) {
      const id = typeof target === 'string' ? target : target.step
      collectFollowUpStepIds(id, acc)
    }
  }
  return acc
}

/** The answers without the given step and every follow-up step it can lead to. */
export function clearStepAndFollowUps(answers: Answers, stepId: EntryStepId): Answers {
  const toDelete = collectFollowUpStepIds(stepId)
  const next: Answers = { ...answers }
  for (const id of toDelete) {
    delete next[id]
  }
  return next
}
