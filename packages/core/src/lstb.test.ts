import { describe, expect, it } from 'vitest'
import {
  EMPTY_WAGE_TAX_CERTIFICATE,
  WAGE_TAX_CERTIFICATE_UNCLEAR,
  deserializeWageTaxCertificateField,
  isValidAmount,
  wageTaxCertificateStatus,
  serializeWageTaxCertificateField,
  setWageTaxCertificateField,
  type WageTaxCertificateData,
} from './lstb'

function mit(daten: WageTaxCertificateData, feld: keyof WageTaxCertificateData, wert: number): WageTaxCertificateData {
  return setWageTaxCertificateField(daten, feld, { kind: 'erfasst', wert })
}

const VOLL: WageTaxCertificateData = {
  bruttoarbeitslohn: { kind: 'erfasst', wert: 50000 },
  lohnsteuer: { kind: 'erfasst', wert: 9000 },
  sozialversicherung: { kind: 'erfasst', wert: 10000 },
}

describe('istGueltigerBetrag', () => {
  it('accepts non-negative integers', () => {
    expect(isValidAmount(0)).toBe(true)
    expect(isValidAmount(50000)).toBe(true)
  })
  it('rejects negatives, non-integers and non-finite', () => {
    expect(isValidAmount(-1)).toBe(false)
    expect(isValidAmount(1.5)).toBe(false)
    expect(isValidAmount(Number.NaN)).toBe(false)
    expect(isValidAmount(Number.POSITIVE_INFINITY)).toBe(false)
  })
})

describe('setzeLstbFeld', () => {
  it('replaces one field immutably', () => {
    const next = mit(EMPTY_WAGE_TAX_CERTIFICATE, 'bruttoarbeitslohn', 50000)
    expect(next.bruttoarbeitslohn).toEqual({ kind: 'erfasst', wert: 50000 })
    // The original is untouched.
    expect(EMPTY_WAGE_TAX_CERTIFICATE.bruttoarbeitslohn).toEqual({ kind: 'offen' })
  })
  it('throws on a non-integer erfasst value (defense in depth)', () => {
    expect(() => setWageTaxCertificateField(EMPTY_WAGE_TAX_CERTIFICATE, 'lohnsteuer', { kind: 'erfasst', wert: -5 })).toThrow(RangeError)
  })
  it('accepts offen and unklar states without a value', () => {
    expect(setWageTaxCertificateField(VOLL, 'lohnsteuer', { kind: 'unklar' }).lohnsteuer).toEqual({ kind: 'unklar' })
  })
})

describe('lstbZustand', () => {
  it('the empty mask is unvollstaendig, all three fields offen', () => {
    expect(wageTaxCertificateStatus(EMPTY_WAGE_TAX_CERTIFICATE)).toEqual({
      kind: 'unvollstaendig',
      offen: ['bruttoarbeitslohn', 'lohnsteuer', 'sozialversicherung'],
      unklar: [],
    })
  })

  it('a mask with an unreadable field reports it under unklar, the rest under offen', () => {
    const daten = setWageTaxCertificateField(EMPTY_WAGE_TAX_CERTIFICATE, 'lohnsteuer', { kind: 'unklar' })
    expect(wageTaxCertificateStatus(daten)).toEqual({
      kind: 'unvollstaendig',
      offen: ['bruttoarbeitslohn', 'sozialversicherung'],
      unklar: ['lohnsteuer'],
    })
  })

  it('a complete, consistent mask is vollstaendig and carries the three values out', () => {
    expect(wageTaxCertificateStatus(VOLL)).toEqual({
      kind: 'vollstaendig',
      bruttoarbeitslohn: 50000,
      lohnsteuer: 9000,
      sozialversicherung: 10000,
    })
  })

  it('Lohnsteuer over Brutto is a widerspruch, never a silent fix (ADR-008)', () => {
    const daten = mit(mit(mit(EMPTY_WAGE_TAX_CERTIFICATE, 'bruttoarbeitslohn', 10000), 'lohnsteuer', 20000), 'sozialversicherung', 0)
    expect(wageTaxCertificateStatus(daten)).toEqual({
      kind: 'widerspruch',
      widersprueche: [{ art: 'lohnsteuer-uebersteigt-brutto', lohnsteuer: 20000, bruttoarbeitslohn: 10000 }],
    })
  })

  it('Sozialversicherung over Brutto is a widerspruch too', () => {
    const daten = mit(mit(mit(EMPTY_WAGE_TAX_CERTIFICATE, 'bruttoarbeitslohn', 10000), 'lohnsteuer', 1000), 'sozialversicherung', 15000)
    expect(wageTaxCertificateStatus(daten)).toEqual({
      kind: 'widerspruch',
      widersprueche: [{ art: 'sozialversicherung-uebersteigt-brutto', sozialversicherung: 15000, bruttoarbeitslohn: 10000 }],
    })
  })

  it('reports both contradictions when both exceed the Brutto', () => {
    const daten = mit(mit(mit(EMPTY_WAGE_TAX_CERTIFICATE, 'bruttoarbeitslohn', 1000), 'lohnsteuer', 2000), 'sozialversicherung', 3000)
    const zustand = wageTaxCertificateStatus(daten)
    expect(zustand.kind).toBe('widerspruch')
    if (zustand.kind !== 'widerspruch') throw new Error('expected widerspruch')
    expect(zustand.widersprueche).toHaveLength(2)
  })
})

describe('serialisiereLstbFeld / deserialisiereLstbFeld — the one persistence encoding', () => {
  it('round-trips offen → null, unklar → marker, erfasst → decimal string', () => {
    expect(serializeWageTaxCertificateField({ kind: 'offen' })).toBeNull()
    expect(serializeWageTaxCertificateField({ kind: 'unklar' })).toBe(WAGE_TAX_CERTIFICATE_UNCLEAR)
    expect(serializeWageTaxCertificateField({ kind: 'erfasst', wert: 50000 })).toBe('50000')
  })

  it('deserialises back to the same state', () => {
    expect(deserializeWageTaxCertificateField(null)).toEqual({ kind: 'offen' })
    expect(deserializeWageTaxCertificateField(WAGE_TAX_CERTIFICATE_UNCLEAR)).toEqual({ kind: 'unklar' })
    expect(deserializeWageTaxCertificateField('50000')).toEqual({ kind: 'erfasst', wert: 50000 })
  })

  it('a stored value that is neither marker nor amount throws (corruption, never a guess)', () => {
    expect(() => deserializeWageTaxCertificateField('lohnsteuer')).toThrow(/neither offen, unklar, nor a valid amount/)
    expect(() => deserializeWageTaxCertificateField('-5')).toThrow()
  })
})
