// Basis interview answers that follow from what the owl already knows: a wage tax certificate or a
// Swiss salary statement means "Angestellt", a pension alone means "Rente", recorded children answer
// the children question. The model often forgets to
// record them, and without `job` the estimate stays "nur-angestellte". Never overrides an answer.
import type { CaseDigest } from './advisor'
import type { OwlSourceId } from './owl-mode'

export interface DerivedBasisAnswer {
  readonly field: 'job' | 'ausland' | 'kinder'
  readonly value: string
  readonly label: string
  readonly reason: string
  readonly sourceId: OwlSourceId
}

export function deriveBasisAnswers(digest: CaseDigest): DerivedBasisAnswer[] {
  // Without the list of answered questions nothing is known to be missing.
  if (!digest.answeredBasis) return []
  const answered = new Set(digest.answeredBasis)
  const hasLstb = digest.lstbPersonA.grossWageEur !== null
  const hasSwissWage = digest.crossBorder.grossWageChf !== null
  const hasPension = digest.furtherFacts?.pension != null
  const out: DerivedBasisAnswer[] = []

  if (!answered.has('job')) {
    if (hasLstb || hasSwissWage) {
      out.push({
        field: 'job',
        value: 'Angestellt',
        label: 'Beschäftigung: Angestellt',
        reason: hasLstb ? 'Du hast eine Lohnsteuerbescheinigung eingetragen, also bist du angestellt.' : 'Du hast einen Schweizer Lohnausweis eingetragen, also bist du angestellt.',
        sourceId: 'estg-9-1',
      })
    } else if (hasPension) {
      out.push({
        field: 'job',
        value: 'Rente',
        label: 'Beschäftigung: Rente',
        reason: 'Du hast eine Rente eingetragen und keinen Arbeitslohn.',
        sourceId: 'estg-9-1',
      })
    }
  }
  if (!answered.has('ausland') && hasSwissWage) {
    out.push({
      field: 'ausland',
      value: 'Ja, in die Schweiz',
      label: 'Arbeit im Ausland: Schweiz',
      reason: 'Du hast einen Schweizer Lohnausweis eingetragen, also arbeitest du in der Schweiz.',
      sourceId: 'estg-9-1',
    })
  }
  // Recorded children answer the basis question; without it the child and single-parent allowances are missing.
  if (!answered.has('kinder') && digest.childrenCount > 0) {
    out.push({
      field: 'kinder',
      value: digest.childrenCount === 1 ? '1 Kind' : '2 oder mehr',
      label: `Kinder: ${digest.childrenCount === 1 ? '1 Kind' : '2 oder mehr'}`,
      reason: 'Du hast Kinder erfasst.',
      sourceId: 'estg-9-1',
    })
  }
  return out
}
