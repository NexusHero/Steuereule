import { describe, expect, it } from 'vitest'
import { officialMonthlyRate, actualRate } from './wechselkurs'
import { checkCrossBorder, type CrossBorderPlausibilityInput } from './grenzgaenger-plausibilitaet'

// M2 — the CH plausibility check: Widersprüche block, Hinweise flag, offene Felder are named.

function input(overrides: Partial<CrossBorderPlausibilityInput> = {}): CrossBorderPlausibilityInput {
  return {
    residence: 'Deutschland',
    nonReturnDays: 10,
    exchangeRate: officialMonthlyRate('2026-01', 0.9412),
    salaryCertificate: { 'bruttolohn-total': 84000, 'berufliche-vorsorge': 5000, quellensteuer: 3780 },
    hasChildren: false,
    hasFamilyAllowances: false,
    ...overrides,
  }
}

describe('pruefeGrenzgaenger — M2 CH', () => {
  it('a complete, consistent echter Grenzgänger is einreichbar with no points', () => {
    expect(checkCrossBorder(input())).toEqual({ submittable: true, points: [] })
  })

  it('a tatsächlicher Kurs without its Beleg is a Widerspruch (ADR-012)', () => {
    const finding = checkCrossBorder(
      input({ exchangeRate: { month: '2026-01', rate: 0.92, mode: 'tatsaechlich' } }),
    )
    expect(finding.submittable).toBe(false)
    expect(finding.points).toContainEqual({ grad: 'widerspruch', code: 'wechselkurs-tatsaechlich-ohne-beleg' })
  })

  it('a tatsächlicher Kurs WITH a Beleg raises no Widerspruch', () => {
    const finding = checkCrossBorder(
      input({ exchangeRate: actualRate('2026-01', 0.92, 'beleg-7') }),
    )
    expect(finding.points).not.toContainEqual({ grad: 'widerspruch', code: 'wechselkurs-tatsaechlich-ohne-beleg' })
  })

  it('missing required Lohnausweis fields are offen and block submission', () => {
    const finding = checkCrossBorder(input({ salaryCertificate: {} }))
    expect(finding.submittable).toBe(false)
    expect(finding.points).toContainEqual({ grad: 'offen', code: 'lohnausweis-fehlt', field: 'bruttolohn-total' })
    expect(finding.points).toContainEqual({ grad: 'offen', code: 'lohnausweis-fehlt', field: 'berufliche-vorsorge' })
    expect(finding.points).toContainEqual({ grad: 'offen', code: 'lohnausweis-fehlt', field: 'quellensteuer' })
  })

  it('a Nettolohn that contradicts the Lohnausweis arithmetic is a Widerspruch', () => {
    const finding = checkCrossBorder(
      input({ salaryCertificate: { 'bruttolohn-total': 84000, 'berufliche-vorsorge': 5000, 'ahv-beitraege': 4200, quellensteuer: 3780, nettolohn: 1 } }),
    )
    expect(finding.points).toContainEqual({ grad: 'widerspruch', code: 'lohnausweis-nettolohn-inkonsistent' })
  })

  it('a consistent Nettolohn raises no Widerspruch', () => {
    const finding = checkCrossBorder(
      input({ salaryCertificate: { 'bruttolohn-total': 84000, 'berufliche-vorsorge': 5000, 'ahv-beitraege': 4200, quellensteuer: 3780, nettolohn: 74800 } }),
    )
    expect(finding.points).not.toContainEqual({ grad: 'widerspruch', code: 'lohnausweis-nettolohn-inkonsistent' })
  })

  it('Familienzulagen without children is a Widerspruch (ADR-029 point 6)', () => {
    const finding = checkCrossBorder(input({ hasChildren: false, hasFamilyAllowances: true }))
    expect(finding.submittable).toBe(false)
    expect(finding.points).toContainEqual({ grad: 'widerspruch', code: 'zulagen-ohne-kinder' })
  })

  it('more than 60 Nichtrückkehrtage is a Hinweis (status loss), not a block', () => {
    expect(checkCrossBorder(input({ nonReturnDays: 60 })).points).not.toContainEqual({ grad: 'hinweis', code: 'grenzgaenger-status-verloren' })
    const finding = checkCrossBorder(input({ nonReturnDays: 61 }))
    expect(finding.points).toContainEqual({ grad: 'hinweis', code: 'grenzgaenger-status-verloren' })
    expect(finding.submittable).toBe(true) // a Hinweis never blocks
  })
})
