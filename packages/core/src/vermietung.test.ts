import { describe, expect, it } from 'vitest'
import {
  depreciationRatePercent,
  isValidRentalAmount,
  isRentalCalculable,
  emptyRentalObject,
  classifyRental,
  serializeRentalField,
  deserializeRentalField,
  setRentalField,
  rentalPropertyAsIncomeItem,
  rentalPropertyFacts,
  rentalStatus,
  type RentalObjectData,
} from './vermietung'

// Ticket 10.6 — Vermietung EINFACH (product ADR-033): the Einordnung (Einfach/Mehrere
// computable, Verkauf/möbliert gated), the guided mask for one object, the § 7 Abs. 4 Satz 1
// EStG lineare AfA (cited bands, never invented), and the fold — offen where offen, never a
// fabricated zero.

describe('ordneVermietungEin — the vermietung-art answer mapped onto what it means', () => {
  it('Einfach and Mehrere are computable (ganzjährig vermietet, je Objekt eine Anlage V)', () => {
    expect(classifyRental('Einfach')).toEqual({ kind: 'einfach' })
    expect(classifyRental('Mehrere')).toEqual({ kind: 'mehrere' })
    expect(isRentalCalculable({ kind: 'einfach' })).toBe(true)
    expect(isRentalCalculable({ kind: 'mehrere' })).toBe(true)
  })

  it('Verkauf oder möbliert stays gated (ADR-033 — the boundary is named, never widened)', () => {
    expect(classifyRental('Verkauf oder möbliert')).toEqual({ kind: 'verkauf-oder-moebliert' })
    expect(isRentalCalculable({ kind: 'verkauf-oder-moebliert' })).toBe(false)
  })

  it('a missing answer is unbekannt — nothing is guessed', () => {
    expect(classifyRental(undefined)).toEqual({ kind: 'unbekannt' })
    expect(classifyRental('irgendwas')).toEqual({ kind: 'unbekannt' })
    expect(isRentalCalculable({ kind: 'unbekannt' })).toBe(false)
  })
})

describe('afaSatzProzent — § 7 Abs. 4 Satz 1 EStG, the three statutory bands verbatim', () => {
  it('before 1925: 2,5 %', () => {
    expect(depreciationRatePercent(1900)).toBe(2.5)
    expect(depreciationRatePercent(1924)).toBe(2.5)
  })

  it('1925–2022: 2 %', () => {
    expect(depreciationRatePercent(1925)).toBe(2)
    expect(depreciationRatePercent(1990)).toBe(2)
    expect(depreciationRatePercent(2022)).toBe(2)
  })

  it('from 2023: 3 % (Wohngebäude, § 7 Abs. 4 Satz 1 Nr. 2 i.d.F. JStG 2022)', () => {
    expect(depreciationRatePercent(2023)).toBe(3)
    expect(depreciationRatePercent(2030)).toBe(3)
  })

  it('a non-integer or negative Baujahr is offen — never guessed', () => {
    expect(depreciationRatePercent(1990.5)).toBeNull()
    expect(depreciationRatePercent(-1)).toBeNull()
  })
})

describe('the guided mask — one Vermietungsobjekt', () => {
  it('starts with every field open', () => {
    const property = emptyRentalObject('obj-1')
    expect(property.mieteinnahmen).toEqual({ kind: 'offen' })
    expect(property.anschaffungskosten).toEqual({ kind: 'offen' })
    expect(property.baujahr).toEqual({ kind: 'offen' })
    expect(property.werbungskosten).toEqual({ kind: 'offen' })
  })

  it('setzeVermietungFeld captures and rejects invalid erfasst values', () => {
    const property = setRentalField(emptyRentalObject('o1'), 'mieteinnahmen', { kind: 'erfasst', value: 12000 })
    expect(property.mieteinnahmen).toEqual({ kind: 'erfasst', value: 12000 })
    expect(() => setRentalField(emptyRentalObject('o1'), 'baujahr', { kind: 'erfasst', value: -1 })).toThrow(RangeError)
    expect(() => setRentalField(emptyRentalObject('o1'), 'baujahr', { kind: 'erfasst', value: 1.5 })).toThrow(RangeError)
  })

  it('round-trips the persistence encoding', () => {
    expect(serializeRentalField({ kind: 'offen' })).toBeNull()
    expect(serializeRentalField({ kind: 'unklar' })).toBe('unklar')
    expect(serializeRentalField({ kind: 'erfasst', value: 12000 })).toBe('12000')
    expect(deserializeRentalField(null)).toEqual({ kind: 'offen' })
    expect(deserializeRentalField('unklar')).toEqual({ kind: 'unklar' })
    expect(deserializeRentalField('12000')).toEqual({ kind: 'erfasst', value: 12000 })
    expect(() => deserializeRentalField('zwölf')).toThrow()
  })
})

function propertyWith(id: string, overrides: Partial<RentalObjectData> = {}): RentalObjectData {
  return { ...emptyRentalObject(id), ...overrides }
}

const FULL = (id: string): RentalObjectData =>
  propertyWith(id, {
    mieteinnahmen: { kind: 'erfasst', value: 12000 },
    anschaffungskosten: { kind: 'erfasst', value: 200000 },
    baujahr: { kind: 'erfasst', value: 1990 },
    werbungskosten: { kind: 'erfasst', value: 1500 },
  })

describe('vermietungsobjektFakten — one object\'s honest facts', () => {
  it('a complete object yields Mieteinnahmen, Werbungskosten and the lineare AfA with Herkunft', () => {
    const facts = rentalPropertyFacts(FULL('a'))
    expect(facts.einnahmen).toBe(12000)
    expect(facts.werbungskosten).toBe(1500)
    // 200.000 × 2 % (Baujahr 1990) = 4.000.
    expect(facts.depreciation).toEqual({ amount: 4000, provenance: '§ 7 Abs. 4 Satz 1 EStG — lineare AfA 2 % bei Baujahr 1990' })
    expect(facts.openItems).toBe(0)
  })

  it('an empty object has three blocked results — Mieteinnahmen, AfA, Werbungskosten', () => {
    const facts = rentalPropertyFacts(emptyRentalObject('a'))
    expect(facts.einnahmen).toBeNull()
    expect(facts.werbungskosten).toBeNull()
    expect(facts.depreciation).toBeNull()
    expect(facts.openItems).toBe(3)
  })

  it('Werbungskosten may be 0 — the USER\'s entry, never a kernel-invented zero', () => {
    const facts = rentalPropertyFacts(propertyWith('a', { mieteinnahmen: { kind: 'erfasst', value: 12000 }, anschaffungskosten: { kind: 'erfasst', value: 200000 }, baujahr: { kind: 'erfasst', value: 1990 }, werbungskosten: { kind: 'erfasst', value: 0 } }))
    expect(facts.werbungskosten).toBe(0)
    expect(facts.openItems).toBe(0)
  })

  it('an unklar field blocks its result honestly', () => {
    const facts = rentalPropertyFacts(propertyWith('a', { mieteinnahmen: { kind: 'unklar' } }))
    expect(facts.einnahmen).toBeNull()
    expect(facts.openItems).toBe(3)
  })
})

describe('vermietungsobjektAlsEinnahmePosten — the fold into the deterministic core', () => {
  it('an erfasst Mieteinnahmen becomes a Vermietung-Posten with Herkunft eingabe', () => {
    const items = rentalPropertyAsIncomeItem(FULL('a'))
    expect(items).toEqual({
      id: 'vermietung-a',
      incomeType: 'Vermietung',
      amount: 12000,
      source: { art: 'eingabe' },
    })
  })

  it('an open field stays null — OFFEN, never a fabricated zero', () => {
    expect(rentalPropertyAsIncomeItem(emptyRentalObject('a'))).toBeNull()
  })
})

describe('vermietungStand — the honest fold over ALL objects', () => {
  it('is bestimmt with the separate sums when every object is complete', () => {
    const status = rentalStatus([FULL('a'), FULL('b')], [])
    expect(status).toEqual({
      kind: 'bestimmt',
      einnahmen: 24000,
      vorsorgeaufwand: 0,
      anrechnung: 0,
      werbungskosten: 3000,
      depreciation: 8000,
      openItems: 0,
      conflicts: 0,
      gated: [],
    })
  })

  it('is offen naming the blocked count when an object is incomplete — never a guessed zero', () => {
    const status = rentalStatus([FULL('a'), emptyRentalObject('b')], [])
    expect(status.kind).toBe('offen')
    if (status.kind === 'offen') {
      expect(status.openItems).toBe(3)
      expect(status.einnahmen).toBe(12000) // partial truth stated as a partial truth
      expect(status.werbungskosten).toBe(1500)
      expect(status.depreciation).toBe(4000)
    }
  })

  it('passes gegated through — a Verkauf/möbliert-Anleger reads offen with the gate named (ADR-030/033 combinability)', () => {
    const status = rentalStatus([FULL('a')], ['Vermietung'])
    expect(status.kind).toBe('offen')
    if (status.kind === 'offen') expect(status.gated).toEqual(['Vermietung'])
  })
})

describe('istGueltigerVermietungBetrag — the one amount guard', () => {
  it('accepts non-negative integers, rejects everything else', () => {
    expect(isValidRentalAmount(0)).toBe(true)
    expect(isValidRentalAmount(12000)).toBe(true)
    expect(isValidRentalAmount(-1)).toBe(false)
    expect(isValidRentalAmount(1.5)).toBe(false)
    expect(isValidRentalAmount(Number.NaN)).toBe(false)
  })
})
