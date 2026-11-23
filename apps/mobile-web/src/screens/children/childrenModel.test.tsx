import { describe, expect, it } from 'vitest'
import { missingForPrintout, wholeText, type ChildItem } from './childrenModel'

const CHILD: ChildItem = { id: 'k1', sequenceNumber: 1, firstName: 'Lina', lastName: 'Muster', geburtsdatum: '2020-05-01' }

describe('wholeText', () => {
  it('keeps the whole euros of a typed amount', () => {
    expect(wholeText('266,48')).toBe('266')
    expect(wholeText('266,50')).toBe('267')
    expect(wholeText('1.200')).toBe('1200')
  })

  it('returns null for an empty or unreadable amount', () => {
    expect(wholeText('')).toBeNull()
    expect(wholeText('abc')).toBeNull()
  })
})

describe('missingForPrintout', () => {
  it('lists every gap of a bare child', () => {
    expect(missingForPrintout(CHILD)).toEqual(['steuerId', 'kindschaft', 'familienkasse', 'wohnsitz'])
  })

  it('lists only what is still missing', () => {
    expect(missingForPrintout({ ...CHILD, taxId: '12345678901', kinship: '1' })).toEqual(['familienkasse', 'wohnsitz'])
  })

  it('counts a residence answered with no as given', () => {
    expect(missingForPrintout({ ...CHILD, taxId: '12345678901', kinship: '1', familyBenefitsOffice: 'Familienkasse Nord', domesticResidenceAllYear: false })).toEqual([])
  })
})
