import type { AssessmentResponseDto } from '@steuereule/api-client'

/** A Bescheid that has arrived but holds nothing yet: every field open, no date, no Frist. */
export function emptyAssessment(): AssessmentResponseDto {
  return {
    status: 'eingegangen',
    assessmentDate: null,
    appealReason: null,
    appealDate: null,
    appealOutcome: null,
    appealOutcomeAmount: null,
    fields: [
      { id: 'einnahmen', kind: 'offen' },
      { id: 'vorsorgeaufwand', kind: 'offen' },
      { id: 'anrechnung', kind: 'offen' },
      { id: 'festgesetzteSteuer', kind: 'offen' },
      { id: 'erstattung', kind: 'offen' },
    ],
    reconciliation: { deviations: [], calculationIncomplete: false },
    frist: { assessmentDate: null, deadlineEnd: null, remainingDays: null, running: null },
    nextStates: ['geprüft'],
    positions: [],
    explanations: [],
    diff: null,
  }
}
