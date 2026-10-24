import { describe, expect, it } from 'vitest'
import {
  LEERES_LSTB,
  LSTB_UNKLAR,
  deserialisiereLstbFeld,
  istGueltigerBetrag,
  lstbZustand,
  serialisiereLstbFeld,
  setzeLstbFeld,
  type LstbDaten,
} from './lstb'

function mit(daten: LstbDaten, feld: keyof LstbDaten, wert: number): LstbDaten {
  return setzeLstbFeld(daten, feld, { kind: 'erfasst', wert })
}

const VOLL: LstbDaten = {
  bruttoarbeitslohn: { kind: 'erfasst', wert: 50000 },
  lohnsteuer: { kind: 'erfasst', wert: 9000 },
  sozialversicherung: { kind: 'erfasst', wert: 10000 },
}

describe('istGueltigerBetrag', () => {
  it('accepts non-negative integers', () => {
    expect(istGueltigerBetrag(0)).toBe(true)
    expect(istGueltigerBetrag(50000)).toBe(true)
  })
  it('rejects negatives, non-integers and non-finite', () => {
    expect(istGueltigerBetrag(-1)).toBe(false)
    expect(istGueltigerBetrag(1.5)).toBe(false)
    expect(istGueltigerBetrag(Number.NaN)).toBe(false)
    expect(istGueltigerBetrag(Number.POSITIVE_INFINITY)).toBe(false)
  })
})

describe('setzeLstbFeld', () => {
  it('replaces one field immutably', () => {
    const next = mit(LEERES_LSTB, 'bruttoarbeitslohn', 50000)
    expect(next.bruttoarbeitslohn).toEqual({ kind: 'erfasst', wert: 50000 })
    // The original is untouched.
    expect(LEERES_LSTB.bruttoarbeitslohn).toEqual({ kind: 'offen' })
  })
  it('throws on a non-integer erfasst value (defense in depth)', () => {
    expect(() => setzeLstbFeld(LEERES_LSTB, 'lohnsteuer', { kind: 'erfasst', wert: -5 })).toThrow(RangeError)
  })
  it('accepts offen and unklar states without a value', () => {
    expect(setzeLstbFeld(VOLL, 'lohnsteuer', { kind: 'unklar' }).lohnsteuer).toEqual({ kind: 'unklar' })
  })
})

describe('lstbZustand', () => {
  it('the empty mask is unvollstaendig, all three fields offen', () => {
    expect(lstbZustand(LEERES_LSTB)).toEqual({
      kind: 'unvollstaendig',
      offen: ['bruttoarbeitslohn', 'lohnsteuer', 'sozialversicherung'],
      unklar: [],
    })
  })

  it('a mask with an unreadable field reports it under unklar, the rest under offen', () => {
    const daten = setzeLstbFeld(LEERES_LSTB, 'lohnsteuer', { kind: 'unklar' })
    expect(lstbZustand(daten)).toEqual({
      kind: 'unvollstaendig',
      offen: ['bruttoarbeitslohn', 'sozialversicherung'],
      unklar: ['lohnsteuer'],
    })
  })

  it('a complete, consistent mask is vollstaendig and carries the three values out', () => {
    expect(lstbZustand(VOLL)).toEqual({
      kind: 'vollstaendig',
      bruttoarbeitslohn: 50000,
      lohnsteuer: 9000,
      sozialversicherung: 10000,
    })
  })

  it('Lohnsteuer over Brutto is a widerspruch, never a silent fix (ADR-008)', () => {
    const daten = mit(mit(mit(LEERES_LSTB, 'bruttoarbeitslohn', 10000), 'lohnsteuer', 20000), 'sozialversicherung', 0)
    expect(lstbZustand(daten)).toEqual({
      kind: 'widerspruch',
      widersprueche: [{ art: 'lohnsteuer-uebersteigt-brutto', lohnsteuer: 20000, bruttoarbeitslohn: 10000 }],
    })
  })

  it('Sozialversicherung over Brutto is a widerspruch too', () => {
    const daten = mit(mit(mit(LEERES_LSTB, 'bruttoarbeitslohn', 10000), 'lohnsteuer', 1000), 'sozialversicherung', 15000)
    expect(lstbZustand(daten)).toEqual({
      kind: 'widerspruch',
      widersprueche: [{ art: 'sozialversicherung-uebersteigt-brutto', sozialversicherung: 15000, bruttoarbeitslohn: 10000 }],
    })
  })

  it('reports both contradictions when both exceed the Brutto', () => {
    const daten = mit(mit(mit(LEERES_LSTB, 'bruttoarbeitslohn', 1000), 'lohnsteuer', 2000), 'sozialversicherung', 3000)
    const zustand = lstbZustand(daten)
    expect(zustand.kind).toBe('widerspruch')
    if (zustand.kind !== 'widerspruch') throw new Error('expected widerspruch')
    expect(zustand.widersprueche).toHaveLength(2)
  })
})

describe('serialisiereLstbFeld / deserialisiereLstbFeld — the one persistence encoding', () => {
  it('round-trips offen → null, unklar → marker, erfasst → decimal string', () => {
    expect(serialisiereLstbFeld({ kind: 'offen' })).toBeNull()
    expect(serialisiereLstbFeld({ kind: 'unklar' })).toBe(LSTB_UNKLAR)
    expect(serialisiereLstbFeld({ kind: 'erfasst', wert: 50000 })).toBe('50000')
  })

  it('deserialises back to the same state', () => {
    expect(deserialisiereLstbFeld(null)).toEqual({ kind: 'offen' })
    expect(deserialisiereLstbFeld(LSTB_UNKLAR)).toEqual({ kind: 'unklar' })
    expect(deserialisiereLstbFeld('50000')).toEqual({ kind: 'erfasst', wert: 50000 })
  })

  it('a stored value that is neither marker nor amount throws (corruption, never a guess)', () => {
    expect(() => deserialisiereLstbFeld('lohnsteuer')).toThrow(/neither offen, unklar, nor a valid amount/)
    expect(() => deserialisiereLstbFeld('-5')).toThrow()
  })
})
