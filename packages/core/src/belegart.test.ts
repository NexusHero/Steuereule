import { describe, expect, it } from 'vitest'
import { RECEIPT_TYPES, isReceiptType } from './belegart'

// ADR-029 — the Beleg-Posteingang's document-type vocabulary. The CH sources are distinct
// types; the pre-CH generic receipt is `Sonstiges`. The set is shared and extensible.

describe('BELEGARTEN — the CH document types (ADR-029)', () => {
  it('lists the CH sources, the Rentenbezugsmitteilung, the Steuerbescheinigung and the generic fallback in canonical order', () => {
    expect(RECEIPT_TYPES).toEqual([
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
    expect(isReceiptType('Lohnausweis')).toBe(true)
    expect(isReceiptType('Rentenbezugsmitteilung')).toBe(true)
    expect(isReceiptType('Steuerbescheinigung')).toBe(true)
    expect(isReceiptType('Steuerbescheid')).toBe(true)
    expect(isReceiptType('Sonstiges')).toBe(true)
  })

  it('rejects an unknown value', () => {
    expect(isReceiptType('LStB')).toBe(false) // the Angestellten vertical's type, not yet declared
    expect(isReceiptType('')).toBe(false)
    expect(isReceiptType('lohnausweis')).toBe(false) // values are case-sensitive German terms
  })
})
