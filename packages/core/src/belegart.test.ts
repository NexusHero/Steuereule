import { describe, expect, it } from 'vitest'
import { BELEGARTEN, isBelegart } from './belegart'

// ADR-029 — the Beleg-Posteingang's document-type vocabulary. The CH sources are distinct
// types; the pre-CH generic receipt is `Sonstiges`. The set is shared and extensible.

describe('BELEGARTEN — the CH document types (ADR-029)', () => {
  it('lists the CH sources, the Rentenbezugsmitteilung, the Steuerbescheinigung and the generic fallback in canonical order', () => {
    expect(BELEGARTEN).toEqual([
      'Lohnausweis',
      'Quellensteuer',
      'Pensionskasse',
      'Saeule3a',
      'Krankenkasse',
      'Familienzulage',
      'Rentenbezugsmitteilung',
      'Steuerbescheinigung',
      'Steuerbescheid',
      'Sonstiges',
    ])
  })
})

describe('isBelegart — total over string', () => {
  it('accepts a declared Belegart', () => {
    expect(isBelegart('Lohnausweis')).toBe(true)
    expect(isBelegart('Rentenbezugsmitteilung')).toBe(true)
    expect(isBelegart('Steuerbescheinigung')).toBe(true)
    expect(isBelegart('Steuerbescheid')).toBe(true)
    expect(isBelegart('Sonstiges')).toBe(true)
  })

  it('rejects an unknown value', () => {
    expect(isBelegart('LStB')).toBe(false) // the Angestellten vertical's type, not yet declared
    expect(isBelegart('')).toBe(false)
    expect(isBelegart('lohnausweis')).toBe(false) // values are case-sensitive German terms
  })
})
