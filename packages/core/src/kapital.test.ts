import { describe, expect, it } from 'vitest'
import {
  LEERES_KAPITAL,
  deserialisiereKapitalFeld,
  istGueltigerKapitalBetrag,
  kapitalAlsKernposten,
  kapitalStand,
  ordneKapDepotEin,
  serialisiereKapitalFeld,
  setzeKapitalFeld,
  istGuenstigerpruefungAnwendbar,
} from './kapital'

// Ticket 10.5 — Kapitalerträge (product ADR-032): the depot-Einordnung (German/foreign broker,
// Krypto gate), the guided mask (Jahressteuerbescheinigung fallback) and its fold into the
// deterministic core — offen where offen, never a fabricated zero.

describe('ordneKapDepotEin — the kap-depot answer mapped onto what it means', () => {
  it('a German broker withheld Abgeltungsteuer', () => {
    expect(ordneKapDepotEin('Deutscher Broker')).toEqual({ kind: 'deutscher-broker' })
  })

  it('a foreign broker withheld nothing — KAP-Pflicht, never a guessed Abgeltung', () => {
    expect(ordneKapDepotEin('Ausländischer Broker')).toEqual({ kind: 'auslaendischer-broker' })
  })

  it('Krypto is gated (product ADR-032 §2 — 2.0, no half feature)', () => {
    expect(ordneKapDepotEin('Krypto')).toEqual({ kind: 'krypto' })
  })

  it('a missing answer is unbekannt — nothing is guessed', () => {
    expect(ordneKapDepotEin(undefined)).toEqual({ kind: 'unbekannt' })
    expect(ordneKapDepotEin('irgendwas')).toEqual({ kind: 'unbekannt' })
  })

  it('the § 32d Abs. 6 Günstigerprüfung applies only where Abgeltungsteuer was withheld', () => {
    expect(istGuenstigerpruefungAnwendbar({ kind: 'deutscher-broker' })).toBe(true)
    expect(istGuenstigerpruefungAnwendbar({ kind: 'auslaendischer-broker' })).toBe(false)
    expect(istGuenstigerpruefungAnwendbar({ kind: 'krypto' })).toBe(false)
    expect(istGuenstigerpruefungAnwendbar({ kind: 'unbekannt' })).toBe(false)
  })
})

describe('setzeKapitalFeld — the one setter', () => {
  it('captures a non-negative integer as erfasst', () => {
    const next = setzeKapitalFeld(LEERES_KAPITAL, 'kapitalertraege', { kind: 'erfasst', wert: 2500 })
    expect(next.kapitalertraege).toEqual({ kind: 'erfasst', wert: 2500 })
  })

  it('accepts offen and unklar', () => {
    expect(setzeKapitalFeld(LEERES_KAPITAL, 'kapitalertraege', { kind: 'unklar' }).kapitalertraege).toEqual({ kind: 'unklar' })
    expect(setzeKapitalFeld(LEERES_KAPITAL, 'kapitalertraege', { kind: 'offen' }).kapitalertraege).toEqual({ kind: 'offen' })
  })

  it('throws on an invalid erfasst value', () => {
    expect(() => setzeKapitalFeld(LEERES_KAPITAL, 'kapitalertraege', { kind: 'erfasst', wert: -1 })).toThrow(RangeError)
    expect(() => setzeKapitalFeld(LEERES_KAPITAL, 'kapitalertraege', { kind: 'erfasst', wert: 1.5 })).toThrow(RangeError)
    expect(() => setzeKapitalFeld(LEERES_KAPITAL, 'kapitalertraege', { kind: 'erfasst', wert: Number.NaN })).toThrow(RangeError)
  })
})

describe('the persistence encoding — the ONE place offen/unklar/erfasst maps to a string', () => {
  it('round-trips all three states', () => {
    expect(serialisiereKapitalFeld({ kind: 'offen' })).toBeNull()
    expect(serialisiereKapitalFeld({ kind: 'unklar' })).toBe('unklar')
    expect(serialisiereKapitalFeld({ kind: 'erfasst', wert: 2500 })).toBe('2500')

    expect(deserialisiereKapitalFeld(null)).toEqual({ kind: 'offen' })
    expect(deserialisiereKapitalFeld('unklar')).toEqual({ kind: 'unklar' })
    expect(deserialisiereKapitalFeld('2500')).toEqual({ kind: 'erfasst', wert: 2500 })
  })

  it('throws on a stored value that is neither (corruption, never guessed)', () => {
    expect(() => deserialisiereKapitalFeld('zwölf')).toThrow()
    expect(() => deserialisiereKapitalFeld('-5')).toThrow()
  })
})

describe('kapitalAlsKernposten — the fold into the deterministic core', () => {
  it('an erfasst field becomes a Kapital-Posten with Herkunft eingabe', () => {
    const posten = kapitalAlsKernposten({ kapitalertraege: { kind: 'erfasst', wert: 2500 } })
    expect(posten).toEqual({
      id: 'kapital',
      einkunftsart: 'Kapital',
      betrag: 2500,
      quelle: { art: 'eingabe' },
    })
  })

  it('an open or unklar field stays null — OFFEN, never a fabricated zero', () => {
    expect(kapitalAlsKernposten(LEERES_KAPITAL)).toBeNull()
    expect(kapitalAlsKernposten({ kapitalertraege: { kind: 'unklar' } })).toBeNull()
  })
})

describe('kapitalStand — the honest Berechnungsstand', () => {
  it('is bestimmt when the field is captured', () => {
    const stand = kapitalStand({ kapitalertraege: { kind: 'erfasst', wert: 2500 } }, [])
    expect(stand).toEqual({ kind: 'bestimmt', einnahmen: 2500, vorsorgeaufwand: 0, anrechnung: 0 })
  })

  it('is offen with one open posten when the field is open', () => {
    const stand = kapitalStand(LEERES_KAPITAL, [])
    expect(stand.kind).toBe('offen')
    if (stand.kind === 'offen') expect(stand.offenePosten).toBe(1)
  })

  it('passes gegated through — a Krypto-Anleger reads offen with the gate named', () => {
    const stand = kapitalStand({ kapitalertraege: { kind: 'erfasst', wert: 2500 } }, ['Kapital'])
    expect(stand.kind).toBe('offen')
    if (stand.kind === 'offen') expect(stand.gegated).toEqual(['Kapital'])
  })
})

describe('istGueltigerKapitalBetrag — the one amount guard', () => {
  it('accepts non-negative integers, rejects everything else', () => {
    expect(istGueltigerKapitalBetrag(0)).toBe(true)
    expect(istGueltigerKapitalBetrag(2500)).toBe(true)
    expect(istGueltigerKapitalBetrag(-1)).toBe(false)
    expect(istGueltigerKapitalBetrag(1.5)).toBe(false)
    expect(istGueltigerKapitalBetrag(Number.NaN)).toBe(false)
  })
})
