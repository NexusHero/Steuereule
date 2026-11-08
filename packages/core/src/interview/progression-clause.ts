import type { Answers } from './interview.js'
import type { ProgressionClauseInput } from '../engine/filing-type-comparison.js'

function integerFrom(value: string | undefined): number {
  if (value === undefined) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function progressionClauseFrom(answers: Answers): ProgressionClauseInput {
  if (answers.lohnersatz === 'Ja') {
    const amount = integerFrom(answers['lohnersatz-betrag'])
    return amount > 0 ? { kind: 'lohnersatzleistungen', amount } : { kind: 'nicht-angegeben' }
  }
  if (answers.lohnersatz === 'Nein') return { kind: 'keine' }
  return { kind: 'nicht-angegeben' }
}
