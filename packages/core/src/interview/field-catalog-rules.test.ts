import { describe, expect, it } from 'vitest'
import { fieldSpec, validateFieldValue } from './field-catalog'

describe('catalogue fields of the fixed rules (ADR-0093)', () => {
  it('takes a negative Ziffer 7 and nothing negative elsewhere', () => {
    expect(validateFieldValue('chLohnausweis', 'andere-leistungen', '-75')).toEqual({ ok: true, value: '-75' })
    expect(validateFieldValue('chLohnausweis', 'andere-leistungen', '−1.075 CHF')).toEqual({ ok: true, value: '-1075' })
    expect(validateFieldValue('chLohnausweis', 'andere-leistungen', '410')).toEqual({ ok: true, value: '410' })
    expect(validateFieldValue('chLohnausweis', 'andere-leistungen', '-0')).toEqual({ ok: true, value: '0' })
    expect(validateFieldValue('chLohnausweis', 'lohn', '-75').ok).toBe(false)
    expect(validateFieldValue('lstb', 'bruttoarbeitslohn', '-1').ok).toBe(false)
  })

  it('has the LStB lines, the Soli with cents, and the confirmations', () => {
    for (const field of ['rvArbeitnehmer', 'rvArbeitgeber', 'kvArbeitnehmer', 'pvArbeitnehmer', 'avArbeitnehmer', 'zuschussPv']) {
      expect(validateFieldValue('lstb', field, '6.150')).toEqual({ ok: true, value: '6150' })
    }
    expect(validateFieldValue('lstb', 'solidaritaetszuschlag', '92,31')).toEqual({ ok: true, value: '92.31' })
    expect(validateFieldValue('commute', 'travelDays', '205')).toEqual({ ok: true, value: '205' })
    expect(validateFieldValue('commute', 'travelDays', '367').ok).toBe(false)
    expect(validateFieldValue('commute', 'shortestRouteConfirmed', 'ja')).toEqual({ ok: true, value: 'true' })
    expect(validateFieldValue('chLohnausweis', 'familienzulagenImBruttolohn', 'nein')).toEqual({ ok: true, value: 'false' })
    expect(validateFieldValue('chLohnausweis', 'krankenkasseZusatzChf', '0')).toEqual({ ok: true, value: '0' })
    expect(fieldSpec('chLohnausweis', 'kvZuschussAnspruch')?.aiWritable).toBe(true)
  })

  it('takes prepayments the way a user writes them', () => {
    expect(validateFieldValue('interview', 'vorauszahlungen-betrag', '4.800 Euro')).toEqual({ ok: true, value: '4800' })
  })
})
