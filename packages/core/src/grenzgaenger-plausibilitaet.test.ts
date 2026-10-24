import { describe, expect, it } from 'vitest'
import { amtlicherMonatskurs, tatsaechlicherKurs } from './wechselkurs'
import { pruefeGrenzgaenger, type GrenzgaengerPlausibilitaetsInput } from './grenzgaenger-plausibilitaet'

// M2 — the CH plausibility check: Widersprüche block, Hinweise flag, offene Felder are named.

function input(overrides: Partial<GrenzgaengerPlausibilitaetsInput> = {}): GrenzgaengerPlausibilitaetsInput {
  return {
    wohnsitz: 'Deutschland',
    nichtrueckkehrtage: 10,
    wechselkurs: amtlicherMonatskurs('2026-01', 0.9412),
    lohnausweis: { 'bruttolohn-total': 84000, 'berufliche-vorsorge': 5000, quellensteuer: 3780 },
    hatKinder: false,
    hatFamilienzulagen: false,
    ...overrides,
  }
}

describe('pruefeGrenzgaenger — M2 CH', () => {
  it('a complete, consistent echter Grenzgänger is einreichbar with no points', () => {
    expect(pruefeGrenzgaenger(input())).toEqual({ einreichbar: true, punkte: [] })
  })

  it('a tatsächlicher Kurs without its Beleg is a Widerspruch (ADR-012)', () => {
    const befund = pruefeGrenzgaenger(
      input({ wechselkurs: { monat: '2026-01', kurs: 0.92, modus: 'tatsaechlich' } }),
    )
    expect(befund.einreichbar).toBe(false)
    expect(befund.punkte).toContainEqual({ grad: 'widerspruch', code: 'wechselkurs-tatsaechlich-ohne-beleg' })
  })

  it('a tatsächlicher Kurs WITH a Beleg raises no Widerspruch', () => {
    const befund = pruefeGrenzgaenger(
      input({ wechselkurs: tatsaechlicherKurs('2026-01', 0.92, 'beleg-7') }),
    )
    expect(befund.punkte).not.toContainEqual({ grad: 'widerspruch', code: 'wechselkurs-tatsaechlich-ohne-beleg' })
  })

  it('missing required Lohnausweis fields are offen and block submission', () => {
    const befund = pruefeGrenzgaenger(input({ lohnausweis: {} }))
    expect(befund.einreichbar).toBe(false)
    expect(befund.punkte).toContainEqual({ grad: 'offen', code: 'lohnausweis-fehlt', feld: 'bruttolohn-total' })
    expect(befund.punkte).toContainEqual({ grad: 'offen', code: 'lohnausweis-fehlt', feld: 'berufliche-vorsorge' })
    expect(befund.punkte).toContainEqual({ grad: 'offen', code: 'lohnausweis-fehlt', feld: 'quellensteuer' })
  })

  it('a Nettolohn that contradicts the Lohnausweis arithmetic is a Widerspruch', () => {
    const befund = pruefeGrenzgaenger(
      input({ lohnausweis: { 'bruttolohn-total': 84000, 'berufliche-vorsorge': 5000, 'ahv-beitraege': 4200, quellensteuer: 3780, nettolohn: 1 } }),
    )
    expect(befund.punkte).toContainEqual({ grad: 'widerspruch', code: 'lohnausweis-nettolohn-inkonsistent' })
  })

  it('a consistent Nettolohn raises no Widerspruch', () => {
    const befund = pruefeGrenzgaenger(
      input({ lohnausweis: { 'bruttolohn-total': 84000, 'berufliche-vorsorge': 5000, 'ahv-beitraege': 4200, quellensteuer: 3780, nettolohn: 74800 } }),
    )
    expect(befund.punkte).not.toContainEqual({ grad: 'widerspruch', code: 'lohnausweis-nettolohn-inkonsistent' })
  })

  it('Familienzulagen without children is a Widerspruch (ADR-029 point 6)', () => {
    const befund = pruefeGrenzgaenger(input({ hatKinder: false, hatFamilienzulagen: true }))
    expect(befund.einreichbar).toBe(false)
    expect(befund.punkte).toContainEqual({ grad: 'widerspruch', code: 'zulagen-ohne-kinder' })
  })

  it('more than 45 Nichtrückkehrtage is a Hinweis (status loss), not a block', () => {
    const befund = pruefeGrenzgaenger(input({ nichtrueckkehrtage: 46 }))
    expect(befund.punkte).toContainEqual({ grad: 'hinweis', code: 'grenzgaenger-status-verloren' })
    expect(befund.einreichbar).toBe(true) // a Hinweis never blocks
  })
})
