import { describe, expect, it } from 'vitest'
import {
  mandatoryCapitalFields,
  EMPTY_CAPITAL,
  deserializeCapitalField,
  isValidCapitalAmount,
  capitalAsCoreLineItem,
  capitalStatus,
  classifyCapitalDepot,
  serializeCapitalField,
  setCapitalField,
  isFavorableTaxTestApplicable,
} from './kapital'

// Ticket 10.5 — Kapitalerträge (product ADR-032): the depot-Einordnung (German/foreign broker,
// Krypto gate), the guided mask (Jahressteuerbescheinigung fallback) and its fold into the
// deterministic core — offen where offen, never a fabricated zero.

describe('ordneKapDepotEin — the kap-depot answer mapped onto what it means', () => {
  it('a German broker withheld Abgeltungsteuer', () => {
    expect(classifyCapitalDepot('Deutscher Broker')).toEqual({ kind: 'deutscher-broker' })
  })

  it('a foreign broker withheld nothing — KAP-Pflicht, never a guessed Abgeltung', () => {
    expect(classifyCapitalDepot('Ausländischer Broker')).toEqual({ kind: 'auslaendischer-broker' })
  })

  it('Krypto is gated (product ADR-032 §2 — 2.0, no half feature)', () => {
    expect(classifyCapitalDepot('Krypto')).toEqual({ kind: 'krypto' })
  })

  it('a missing answer is unbekannt — nothing is guessed', () => {
    expect(classifyCapitalDepot(undefined)).toEqual({ kind: 'unbekannt' })
    expect(classifyCapitalDepot('irgendwas')).toEqual({ kind: 'unbekannt' })
  })

  it('the § 32d Abs. 6 Günstigerprüfung applies only where Abgeltungsteuer was withheld', () => {
    expect(isFavorableTaxTestApplicable({ kind: 'deutscher-broker' })).toBe(true)
    expect(isFavorableTaxTestApplicable({ kind: 'auslaendischer-broker' })).toBe(false)
    expect(isFavorableTaxTestApplicable({ kind: 'krypto' })).toBe(false)
    expect(isFavorableTaxTestApplicable({ kind: 'unbekannt' })).toBe(false)
  })
})

describe('setzeKapitalFeld — the one setter', () => {
  it('captures a non-negative integer as erfasst', () => {
    const next = setCapitalField(EMPTY_CAPITAL, 'kapitalertraege', { kind: 'erfasst', wert: 2500 })
    expect(next.kapitalertraege).toEqual({ kind: 'erfasst', wert: 2500 })
  })

  it('accepts offen and unklar', () => {
    expect(setCapitalField(EMPTY_CAPITAL, 'kapitalertraege', { kind: 'unklar' }).kapitalertraege).toEqual({ kind: 'unklar' })
    expect(setCapitalField(EMPTY_CAPITAL, 'kapitalertraege', { kind: 'offen' }).kapitalertraege).toEqual({ kind: 'offen' })
  })

  it('throws on an invalid erfasst value', () => {
    expect(() => setCapitalField(EMPTY_CAPITAL, 'kapitalertraege', { kind: 'erfasst', wert: -1 })).toThrow(RangeError)
    expect(() => setCapitalField(EMPTY_CAPITAL, 'kapitalertraege', { kind: 'erfasst', wert: 1.5 })).toThrow(RangeError)
    expect(() => setCapitalField(EMPTY_CAPITAL, 'kapitalertraege', { kind: 'erfasst', wert: Number.NaN })).toThrow(RangeError)
  })
})

describe('the persistence encoding — the ONE place offen/unklar/erfasst maps to a string', () => {
  it('round-trips all three states', () => {
    expect(serializeCapitalField({ kind: 'offen' })).toBeNull()
    expect(serializeCapitalField({ kind: 'unklar' })).toBe('unklar')
    expect(serializeCapitalField({ kind: 'erfasst', wert: 2500 })).toBe('2500')

    expect(deserializeCapitalField(null)).toEqual({ kind: 'offen' })
    expect(deserializeCapitalField('unklar')).toEqual({ kind: 'unklar' })
    expect(deserializeCapitalField('2500')).toEqual({ kind: 'erfasst', wert: 2500 })
  })

  it('throws on a stored value that is neither (corruption, never guessed)', () => {
    expect(() => deserializeCapitalField('zwölf')).toThrow()
    expect(() => deserializeCapitalField('-5')).toThrow()
  })
})

describe('kapitalAlsKernposten — the fold into the deterministic core', () => {
  it('an erfasst field becomes a Kapital-Posten with Herkunft eingabe', () => {
    const posten = capitalAsCoreLineItem({ ...EMPTY_CAPITAL, kapitalertraege: { kind: 'erfasst', wert: 2500 } })
    expect(posten).toEqual({
      id: 'kapital',
      einkunftsart: 'Kapital',
      betrag: 2500,
      quelle: { art: 'eingabe' },
    })
  })

  it('an open or unklar field stays null — OFFEN, never a fabricated zero', () => {
    expect(capitalAsCoreLineItem(EMPTY_CAPITAL)).toBeNull()
    expect(capitalAsCoreLineItem({ ...EMPTY_CAPITAL, kapitalertraege: { kind: 'unklar' } })).toBeNull()
  })
})

describe('kapitalStand — the honest Berechnungsstand', () => {
  it('is bestimmt when the field is captured', () => {
    const stand = capitalStatus({ ...EMPTY_CAPITAL, kapitalertraege: { kind: 'erfasst', wert: 2500 } }, [])
    expect(stand).toEqual({ kind: 'bestimmt', einnahmen: 2500, vorsorgeaufwand: 0, anrechnung: 0 })
  })

  it('is offen with one open posten when the field is open', () => {
    const stand = capitalStatus(EMPTY_CAPITAL, [])
    expect(stand.kind).toBe('offen')
    if (stand.kind === 'offen') expect(stand.offenePosten).toBe(1)
  })

  it('passes gegated through — a Krypto-Anleger reads offen with the gate named', () => {
    const stand = capitalStatus({ ...EMPTY_CAPITAL, kapitalertraege: { kind: 'erfasst', wert: 2500 } }, ['Kapital'])
    expect(stand.kind).toBe('offen')
    if (stand.kind === 'offen') expect(stand.gegated).toEqual(['Kapital'])
  })
})

describe('istGueltigerKapitalBetrag — the one amount guard', () => {
  it('accepts non-negative integers, rejects everything else', () => {
    expect(isValidCapitalAmount(0)).toBe(true)
    expect(isValidCapitalAmount(2500)).toBe(true)
    expect(isValidCapitalAmount(-1)).toBe(false)
    expect(isValidCapitalAmount(1.5)).toBe(false)
    expect(isValidCapitalAmount(Number.NaN)).toBe(false)
  })

  it('names what Anlage KAP needs per depot — a German broker also the withheld taxes (Zeilen 37–39)', () => {
    expect(mandatoryCapitalFields('deutscher-broker')).toEqual([
      'kapitalertraege',
      'sparerPauschbetrag',
      'kapitalertragsteuer',
      'solidaritaetszuschlag',
      'kirchensteuer',
    ])
    expect(mandatoryCapitalFields('auslaendischer-broker')).toEqual(['kapitalertraege', 'sparerPauschbetrag'])
  })
})
