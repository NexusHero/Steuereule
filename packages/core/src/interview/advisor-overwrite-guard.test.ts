import { describe, expect, it } from 'vitest'
import { announcedDraftCount, draftCountNote, heldDraftsNote, holdUnaskedOverwrites, numbersInMessage, preparedDraftsSentence, unchangedDraftsNote } from './advisor-overwrite-guard'

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

describe('what the answer says about its drafts (ADR-0066, real-data run)', () => {
  it('names a draft that was left out because the field already holds its value', () => {
    expect(unchangedDraftsNote([])).toBe('')
    const note = unchangedDraftsNote([{ label: 'Kindergeld (Kind 1)', newValue: '3060' }, { label: 'Kontoführung', newValue: '16' }])
    expect(note).toContain('Kindergeld (Kind 1) (3060)')
    expect(note).toContain('Kontoführung (16)')
    expect(note).toContain('keine Karte')
  })

  it('reads how many drafts a text announces, as a figure or a word', () => {
    expect(announcedDraftCount('Ich habe 5 Entwürfe als unverbindliche Vorschläge vorbereitet.')).toBe(5)
    expect(announcedDraftCount('Mit deinen Angaben habe ich dir fünf neue Entwürfe vorbereitet:')).toBe(5)
    expect(announcedDraftCount('Ich habe jetzt 3 Entwürfe vorbereitet – darunter auch die Karte fürs Kindergeld.')).toBe(3)
    expect(announcedDraftCount('Hier sind die beiden Entwurfskarten.')).toBe(2)
    expect(announcedDraftCount('Ich habe den Entwurf vorbereitet.')).toBeNull()
    expect(announcedDraftCount('Du hast 6 Karten übernommen, danke.')).toBeNull()
    expect(announcedDraftCount('Bitte prüfe die Entwürfe.')).toBeNull()
  })

  it('says how many drafts there really are when the text announces more', () => {
    expect(draftCountNote('Ich habe 5 Entwürfe vorbereitet.', 5)).toBe('')
    expect(draftCountNote('Ich habe 5 Entwürfe vorbereitet.', 6)).toBe('')
    expect(draftCountNote('Ich habe 5 Entwürfe vorbereitet.', 3)).toContain('3 Entwürfe')
    expect(draftCountNote('Ich habe 5 Entwürfe vorbereitet.', 3)).toContain('nicht 5')
    expect(draftCountNote('Ich habe 2 Entwürfe vorbereitet.', 1)).toContain('ein Entwurf')
    expect(draftCountNote('Ich habe 2 Entwürfe vorbereitet.', 0)).toContain('kein Entwurf')
    expect(draftCountNote('Alles klar, das habe ich notiert.', 0)).toBe('')
  })

  it('writes the stock sentence for exactly the drafts that are shown', () => {
    expect(preparedDraftsSentence(['Spende'])).toBe('Ich habe den Entwurf „Spende“ als unverbindlichen Vorschlag vorbereitet.')
    // Real-data run: late answers were only „N Entwürfe vorbereitet“; the sentence names them.
    expect(preparedDraftsSentence(['a', 'b', 'c'])).toBe('Ich habe 3 Entwürfe als unverbindliche Vorschläge vorbereitet: „a“, „b“ und „c“.')
    expect(preparedDraftsSentence([])).toBe('')
  })
})

