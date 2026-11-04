import type { Answers } from './interview'
import type { ProgressionsvorbehaltEingabe } from './veranlagungsartenvergleich'

function ganzzahlAus(value: string | undefined): number {
  if (value === undefined) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function progressionsvorbehaltAus(answers: Answers): ProgressionsvorbehaltEingabe {
  if (answers.lohnersatz === 'Ja') {
    const betrag = ganzzahlAus(answers['lohnersatz-betrag'])
    return betrag > 0 ? { art: 'lohnersatzleistungen', betrag } : { art: 'nicht-angegeben' }
  }
  if (answers.lohnersatz === 'Nein') return { art: 'keine' }
  return { art: 'nicht-angegeben' }
}
