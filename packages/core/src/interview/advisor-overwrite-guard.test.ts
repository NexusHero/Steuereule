import { describe, expect, it } from 'vitest'
import { heldDraftsNote, holdUnaskedOverwrites, numbersInMessage } from './advisor-overwrite-guard'

const draft = (field: string, newValue: string, expectedPreviousValue: string | null) => ({ field, label: field, newValue, expectedPreviousValue })

describe('holdUnaskedOverwrites (ADR-0082)', () => {
  it('keeps a draft for an empty field, also one still at its 0 (days driven → vacation days)', () => {
    expect(holdUnaskedOverwrites([draft('a', '100', null), draft('b', 'Ja', ''), draft('vacationDays', '25', '0')], 'Wir sind an 210 Tagen gefahren.').kept).toHaveLength(3)
  })

  it('holds a change of a recorded value the user did not ask for (a premium read as 512 proposed as 5.120)', () => {
    const { kept, held } = holdUnaskedOverwrites([draft('nbuvArbeitgeberChf', '5120', '512')], 'Anna zahlt ebenfalls nichts selbst zum Krankentaggeld.')
    expect(kept).toHaveLength(0)
    expect(held).toEqual([{ label: 'nbuvArbeitgeberChf', recorded: '512', proposed: '5120' }])
    expect(heldDraftsNote(held)).toContain('steht schon auf 512')
  })

  it('drops a draft that would write the value already there', () => {
    const { kept, unchanged } = holdUnaskedOverwrites([draft('ktg', '4200', '4200')], 'Ja.')
    expect(kept).toHaveLength(0)
    expect(unchanged).toHaveLength(1)
  })

  it('lets a change through when the user names the new value or asks to correct it', () => {
    expect(holdUnaskedOverwrites([draft('x', '5120', '512')], 'Die NBU-Prämie war 5.120 CHF.').kept).toHaveLength(1)
    expect(holdUnaskedOverwrites([draft('x', '1478', '1200')], 'SWICA 1.477,80 CHF').kept).toHaveLength(1)
    expect(holdUnaskedOverwrites([draft('x', '700', '512')], 'Das ist falsch, bitte korrigieren.').kept).toHaveLength(1)
    expect(holdUnaskedOverwrites([draft('x', 'Nein', 'Ja')], 'Doch nein, ich hatte keinen Umzug: nein.').kept).toHaveLength(1)
  })
})

describe('numbersInMessage', () => {
  it('reads German, Swiss and plain numbers as whole units', () => {
    expect([...numbersInMessage('5.120 und 5’120,00 sowie 210 Tage und 1 234,60')]).toEqual(expect.arrayContaining([5120, 210, 1234, 1235]))
  })
})
