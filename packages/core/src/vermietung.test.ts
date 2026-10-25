import { describe, expect, it } from 'vitest'
import {
  afaSatzProzent,
  istGueltigerVermietungBetrag,
  istVermietungBerechenbar,
  leeresVermietungsobjekt,
  ordneVermietungEin,
  serialisiereVermietungFeld,
  deserialisiereVermietungFeld,
  setzeVermietungFeld,
  vermietungsobjektAlsEinnahmePosten,
  vermietungsobjektFakten,
  vermietungStand,
  type VermietungsobjektDaten,
} from './vermietung'

// Ticket 10.6 — Vermietung EINFACH (product ADR-033): the Einordnung (Einfach/Mehrere
// computable, Verkauf/möbliert gated), the guided mask for one object, the § 7 Abs. 4 Satz 1
// EStG lineare AfA (cited bands, never invented), and the fold — offen where offen, never a
// fabricated zero.

describe('ordneVermietungEin — the vermietung-art answer mapped onto what it means', () => {
  it('Einfach and Mehrere are computable (ganzjährig vermietet, je Objekt eine Anlage V)', () => {
    expect(ordneVermietungEin('Einfach')).toEqual({ kind: 'einfach' })
    expect(ordneVermietungEin('Mehrere')).toEqual({ kind: 'mehrere' })
    expect(istVermietungBerechenbar({ kind: 'einfach' })).toBe(true)
    expect(istVermietungBerechenbar({ kind: 'mehrere' })).toBe(true)
  })

  it('Verkauf oder möbliert stays gated (ADR-033 — the boundary is named, never widened)', () => {
    expect(ordneVermietungEin('Verkauf oder möbliert')).toEqual({ kind: 'verkauf-oder-moebliert' })
    expect(istVermietungBerechenbar({ kind: 'verkauf-oder-moebliert' })).toBe(false)
  })

  it('a missing answer is unbekannt — nothing is guessed', () => {
    expect(ordneVermietungEin(undefined)).toEqual({ kind: 'unbekannt' })
    expect(ordneVermietungEin('irgendwas')).toEqual({ kind: 'unbekannt' })
    expect(istVermietungBerechenbar({ kind: 'unbekannt' })).toBe(false)
  })
})

describe('afaSatzProzent — § 7 Abs. 4 Satz 1 EStG, the three statutory bands verbatim', () => {
  it('before 1925: 2,5 %', () => {
    expect(afaSatzProzent(1900)).toBe(2.5)
    expect(afaSatzProzent(1924)).toBe(2.5)
  })

  it('1925–2022: 2 %', () => {
    expect(afaSatzProzent(1925)).toBe(2)
    expect(afaSatzProzent(1990)).toBe(2)
    expect(afaSatzProzent(2022)).toBe(2)
  })

  it('from 2023: 3 % (Wohngebäude, § 7 Abs. 4 Satz 1 Nr. 2 i.d.F. JStG 2022)', () => {
    expect(afaSatzProzent(2023)).toBe(3)
    expect(afaSatzProzent(2030)).toBe(3)
  })

  it('a non-integer or negative Baujahr is offen — never guessed', () => {
    expect(afaSatzProzent(1990.5)).toBeNull()
    expect(afaSatzProzent(-1)).toBeNull()
  })
})

describe('the guided mask — one Vermietungsobjekt', () => {
  it('starts with every field open', () => {
    const objekt = leeresVermietungsobjekt('obj-1')
    expect(objekt.mieteinnahmen).toEqual({ kind: 'offen' })
    expect(objekt.anschaffungskosten).toEqual({ kind: 'offen' })
    expect(objekt.baujahr).toEqual({ kind: 'offen' })
    expect(objekt.werbungskosten).toEqual({ kind: 'offen' })
  })

  it('setzeVermietungFeld captures and rejects invalid erfasst values', () => {
    const objekt = setzeVermietungFeld(leeresVermietungsobjekt('o1'), 'mieteinnahmen', { kind: 'erfasst', wert: 12000 })
    expect(objekt.mieteinnahmen).toEqual({ kind: 'erfasst', wert: 12000 })
    expect(() => setzeVermietungFeld(leeresVermietungsobjekt('o1'), 'baujahr', { kind: 'erfasst', wert: -1 })).toThrow(RangeError)
    expect(() => setzeVermietungFeld(leeresVermietungsobjekt('o1'), 'baujahr', { kind: 'erfasst', wert: 1.5 })).toThrow(RangeError)
  })

  it('round-trips the persistence encoding', () => {
    expect(serialisiereVermietungFeld({ kind: 'offen' })).toBeNull()
    expect(serialisiereVermietungFeld({ kind: 'unklar' })).toBe('unklar')
    expect(serialisiereVermietungFeld({ kind: 'erfasst', wert: 12000 })).toBe('12000')
    expect(deserialisiereVermietungFeld(null)).toEqual({ kind: 'offen' })
    expect(deserialisiereVermietungFeld('unklar')).toEqual({ kind: 'unklar' })
    expect(deserialisiereVermietungFeld('12000')).toEqual({ kind: 'erfasst', wert: 12000 })
    expect(() => deserialisiereVermietungFeld('zwölf')).toThrow()
  })
})

function objektMit(id: string, overrides: Partial<VermietungsobjektDaten> = {}): VermietungsobjektDaten {
  return { ...leeresVermietungsobjekt(id), ...overrides }
}

const VOLL = (id: string): VermietungsobjektDaten =>
  objektMit(id, {
    mieteinnahmen: { kind: 'erfasst', wert: 12000 },
    anschaffungskosten: { kind: 'erfasst', wert: 200000 },
    baujahr: { kind: 'erfasst', wert: 1990 },
    werbungskosten: { kind: 'erfasst', wert: 1500 },
  })

describe('vermietungsobjektFakten — one object\'s honest facts', () => {
  it('a complete object yields Mieteinnahmen, Werbungskosten and the lineare AfA with Herkunft', () => {
    const fakten = vermietungsobjektFakten(VOLL('a'))
    expect(fakten.einnahmen).toBe(12000)
    expect(fakten.werbungskosten).toBe(1500)
    // 200.000 × 2 % (Baujahr 1990) = 4.000.
    expect(fakten.afa).toEqual({ betrag: 4000, herkunft: '§ 7 Abs. 4 Satz 1 EStG — lineare AfA 2 % bei Baujahr 1990' })
    expect(fakten.offenePosten).toBe(0)
  })

  it('an empty object has three blocked results — Mieteinnahmen, AfA, Werbungskosten', () => {
    const fakten = vermietungsobjektFakten(leeresVermietungsobjekt('a'))
    expect(fakten.einnahmen).toBeNull()
    expect(fakten.werbungskosten).toBeNull()
    expect(fakten.afa).toBeNull()
    expect(fakten.offenePosten).toBe(3)
  })

  it('Werbungskosten may be 0 — the USER\'s entry, never a kernel-invented zero', () => {
    const fakten = vermietungsobjektFakten(objektMit('a', { mieteinnahmen: { kind: 'erfasst', wert: 12000 }, anschaffungskosten: { kind: 'erfasst', wert: 200000 }, baujahr: { kind: 'erfasst', wert: 1990 }, werbungskosten: { kind: 'erfasst', wert: 0 } }))
    expect(fakten.werbungskosten).toBe(0)
    expect(fakten.offenePosten).toBe(0)
  })

  it('an unklar field blocks its result honestly', () => {
    const fakten = vermietungsobjektFakten(objektMit('a', { mieteinnahmen: { kind: 'unklar' } }))
    expect(fakten.einnahmen).toBeNull()
    expect(fakten.offenePosten).toBe(3)
  })
})

describe('vermietungsobjektAlsEinnahmePosten — the fold into the deterministic core', () => {
  it('an erfasst Mieteinnahmen becomes a Vermietung-Posten with Herkunft eingabe', () => {
    const posten = vermietungsobjektAlsEinnahmePosten(VOLL('a'))
    expect(posten).toEqual({
      id: 'vermietung-a',
      einkunftsart: 'Vermietung',
      betrag: 12000,
      quelle: { art: 'eingabe' },
    })
  })

  it('an open field stays null — OFFEN, never a fabricated zero', () => {
    expect(vermietungsobjektAlsEinnahmePosten(leeresVermietungsobjekt('a'))).toBeNull()
  })
})

describe('vermietungStand — the honest fold over ALL objects', () => {
  it('is bestimmt with the separate sums when every object is complete', () => {
    const stand = vermietungStand([VOLL('a'), VOLL('b')], [])
    expect(stand).toEqual({
      kind: 'bestimmt',
      einnahmen: 24000,
      vorsorgeaufwand: 0,
      anrechnung: 0,
      werbungskosten: 3000,
      afa: 8000,
      offenePosten: 0,
      konflikte: 0,
      gegated: [],
    })
  })

  it('is offen naming the blocked count when an object is incomplete — never a guessed zero', () => {
    const stand = vermietungStand([VOLL('a'), leeresVermietungsobjekt('b')], [])
    expect(stand.kind).toBe('offen')
    if (stand.kind === 'offen') {
      expect(stand.offenePosten).toBe(3)
      expect(stand.einnahmen).toBe(12000) // partial truth stated as a partial truth
      expect(stand.werbungskosten).toBe(1500)
      expect(stand.afa).toBe(4000)
    }
  })

  it('passes gegated through — a Verkauf/möbliert-Anleger reads offen with the gate named (ADR-030/033 combinability)', () => {
    const stand = vermietungStand([VOLL('a')], ['Vermietung'])
    expect(stand.kind).toBe('offen')
    if (stand.kind === 'offen') expect(stand.gegated).toEqual(['Vermietung'])
  })
})

describe('istGueltigerVermietungBetrag — the one amount guard', () => {
  it('accepts non-negative integers, rejects everything else', () => {
    expect(istGueltigerVermietungBetrag(0)).toBe(true)
    expect(istGueltigerVermietungBetrag(12000)).toBe(true)
    expect(istGueltigerVermietungBetrag(-1)).toBe(false)
    expect(istGueltigerVermietungBetrag(1.5)).toBe(false)
    expect(istGueltigerVermietungBetrag(Number.NaN)).toBe(false)
  })
})
