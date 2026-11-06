import { describe, expect, it } from 'vitest'
import type { Answers } from './interview'
import { progressionClauseFrom } from './progressionsvorbehalt'

describe('progressionsvorbehaltAus', () => {
  it('reads a declared Lohnersatzleistung with its amount', () => {
    const answers = { lohnersatz: 'Ja', 'lohnersatz-betrag': '4200' } as Answers

    const input = progressionClauseFrom(answers)

    expect(input).toEqual({ art: 'lohnersatzleistungen', amount: 4200 })
  })

  it('treats a "Ja" without a positive amount as not yet given', () => {
    const answers = { lohnersatz: 'Ja', 'lohnersatz-betrag': '0' } as Answers

    const input = progressionClauseFrom(answers)

    expect(input).toEqual({ art: 'nicht-angegeben' })
  })

  it('reads an explicit "Nein" as no Progressionsvorbehalt', () => {
    const answers = { lohnersatz: 'Nein' } as Answers

    const input = progressionClauseFrom(answers)

    expect(input).toEqual({ art: 'keine' })
  })

  it('treats an unanswered question as not yet given', () => {
    const input = progressionClauseFrom({} as Answers)

    expect(input).toEqual({ art: 'nicht-angegeben' })
  })
})
