export type TaxYearStatus =
  | 'entwurf'
  | 'pruefung'
  | 'eingereicht'
  | 'rueckfrage'
  | 'bescheid'
  | 'abgeschlossen'
  | 'extern-erledigt'

const TRANSITIONS_DE: Readonly<Record<TaxYearStatus, readonly TaxYearStatus[]>> = {
  entwurf: ['pruefung', 'extern-erledigt'],
  pruefung: ['eingereicht', 'entwurf', 'extern-erledigt'],
  eingereicht: ['rueckfrage', 'bescheid'],
  rueckfrage: ['eingereicht', 'bescheid'],
  bescheid: ['abgeschlossen'],
  abgeschlossen: [],
  'extern-erledigt': [],
}

export function isTransitionAllowed(from: TaxYearStatus, to: TaxYearStatus): boolean {
  return TRANSITIONS_DE[from].includes(to)
}

export function nextStates(from: TaxYearStatus): readonly TaxYearStatus[] {
  return TRANSITIONS_DE[from] ?? []
}

export type AssessmentStatus = 'eingegangen' | 'geprüft' | 'einspruch-eingelegt'

const ASSESSMENT_TRANSITIONS: Readonly<Record<AssessmentStatus, readonly AssessmentStatus[]>> = {
  eingegangen: ['geprüft'],
  geprüft: ['einspruch-eingelegt'],
  'einspruch-eingelegt': [],
}

export function isAssessmentTransitionAllowed(from: AssessmentStatus, after: AssessmentStatus): boolean {
  return ASSESSMENT_TRANSITIONS[from].includes(after)
}

export function nextAssessmentStates(from: AssessmentStatus): readonly AssessmentStatus[] {
  return ASSESSMENT_TRANSITIONS[from]
}
