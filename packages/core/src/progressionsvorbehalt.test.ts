import { describe, expect, it } from 'vitest'
import type { Answers } from './interview'
import { progressionsvorbehaltAus } from './progressionsvorbehalt'

describe('progressionsvorbehaltAus', () => {
  it('reads a declared Lohnersatzleistung with its amount', () => {
    const answers = { lohnersatz: 'Ja', 'lohnersatz-betrag': '4200' } as Answers

    const eingabe = progressionsvorbehaltAus(answers)

    expect(eingabe).toEqual({ art: 'lohnersatzleistungen', betrag: 4200 })
  })

  it('treats a "Ja" without a positive amount as not yet given', () => {
    const answers = { lohnersatz: 'Ja', 'lohnersatz-betrag': '0' } as Answers

    const eingabe = progressionsvorbehaltAus(answers)

    expect(eingabe).toEqual({ art: 'nicht-angegeben' })
  })

  it('reads an explicit "Nein" as no Progressionsvorbehalt', () => {
    const answers = { lohnersatz: 'Nein' } as Answers

    const eingabe = progressionsvorbehaltAus(answers)

    expect(eingabe).toEqual({ art: 'keine' })
  })

  it('treats an unanswered question as not yet given', () => {
    const eingabe = progressionsvorbehaltAus({} as Answers)

    expect(eingabe).toEqual({ art: 'nicht-angegeben' })
  })
})
