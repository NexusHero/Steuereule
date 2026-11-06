import { describe, expect, it } from 'vitest'
import {
  calculate,
  resolveConflict,
  type CalculationInput,
  type Item,
  type ItemConflict,
  type Source,
} from './berechnung'

// ADR-014/015/048/008/032 — the deterministic core. The load-bearing property: a
// determined amount is emitted ONLY when nothing is open, conflicting or gated; otherwise
// the result is `offen` and NAMES what blocks it. Never a guess. A conflicting Posten is
// excluded from the sum (ADR-008), and a gated Einkunftsart is named, not silently
// dropped (ADR-032).

const employed: Item = { id: 'p1', incomeType: 'Nichtselbstständig', amount: 1407, source: { kind: 'eingabe' } }

function input(overrides: Partial<CalculationInput> = {}): CalculationInput {
  return {
    items: [],
    openItems: 0,
    conflicts: [],
    gated: [],
    ...overrides,
  }
}

describe('berechne — the honest fold', () => {
  it('sums settled Posten and is `bestimmt` when nothing is open, conflicting or gated', () => {
    const status = calculate(input({ items: [employed, { ...employed, id: 'p2', amount: 593 }] }))
    expect(status).toEqual({ kind: 'bestimmt', einnahmen: 2000, vorsorgeaufwand: 0, anrechnung: 0 })
  })

  it('is `offen` and NAMES the open count when a required Posten is still empty', () => {
    const status = calculate(input({ items: [employed], openItems: 2 }))
    expect(status).toEqual({ kind: 'offen', einnahmen: 1407, vorsorgeaufwand: 0, anrechnung: 0, openItems: 2, conflicts: 0, gated: [], unconfirmedItems: 0, unconfirmedSum: 0 })
  })

  it('is `offen` and names a conflict count, and the conflicting Posten is NOT in the sum (ADR-008)', () => {
    const conflict: ItemConflict = {
      itemId: 'p-conflict',
      incomeType: 'Kapital',
      sources: [
        { kind: 'beleg', receiptId: 'b1', amount: 480 },
        { kind: 'eingabe', amount: 500 },
      ],
    }
    const status = calculate(input({ items: [employed], conflicts: [conflict] }))
    expect(status).toEqual({ kind: 'offen', einnahmen: 1407, vorsorgeaufwand: 0, anrechnung: 0, openItems: 0, conflicts: 1, gated: [], unconfirmedItems: 0, unconfirmedSum: 0 })
  })

  it('is `offen` and names the gated Einkunftsarten (ADR-032: declared but not computable)', () => {
    const status = calculate(input({ items: [employed], gated: ['Gewerbe'] }))
    expect(status).toEqual({ kind: 'offen', einnahmen: 1407, vorsorgeaufwand: 0, anrechnung: 0, openItems: 0, conflicts: 0, gated: ['Gewerbe'], unconfirmedItems: 0, unconfirmedSum: 0 })
  })

  it('`bestimmt` collapses the moment the last blocker clears — the honest point value (ADR-015)', () => {
    const open = calculate(input({ items: [employed], openItems: 1 }))
    expect(open.kind).toBe('offen')
    const determined = calculate(input({ items: [employed], openItems: 0 }))
    expect(determined).toEqual({ kind: 'bestimmt', einnahmen: 1407, vorsorgeaufwand: 0, anrechnung: 0 })
  })

  it('the `offen` einnahmen is a partial truth stated as a partial truth — settled Posten only', () => {
    const status = calculate(input({ items: [employed], openItems: 1, gated: ['Gewerbe'] }))
    expect(status.kind).toBe('offen')
    if (status.kind === 'offen') expect(status.einnahmen).toBe(1407) // no invented amount for the open/gated part
  })

  it('rejects a negative offenePosten and a negative Posten betrag loudly', () => {
    expect(() => calculate(input({ openItems: -1 }))).toThrow(RangeError)
    expect(() => calculate(input({ items: [{ ...employed, amount: -5 }] }))).toThrow(RangeError)
  })
})

describe('berechne — Rolle folding (ADR-029/0015-Lehre, Vorsorge + Anrechnung)', () => {
  const provision: Item = { id: 'pk', incomeType: 'Grenzgänger', role: 'vorsorgeaufwand', amount: 4706, source: { kind: 'beleg', receiptId: 'lohnausweis' } }
  const anrechnung: Item = { id: 'qst', incomeType: 'Grenzgänger', role: 'anrechnung', amount: 3558, source: { kind: 'beleg', receiptId: 'lohnausweis' } }
  const gross: Item = { id: 'brutto', incomeType: 'Grenzgänger', amount: 79061, source: { kind: 'beleg', receiptId: 'lohnausweis' } }

  it('folds Vorsorgeaufwand and Anrechnung into their own buckets, never into Einnahmen', () => {
    const status = calculate(input({ items: [gross, provision, anrechnung] }))
    expect(status).toEqual({ kind: 'bestimmt', einnahmen: 79061, vorsorgeaufwand: 4706, anrechnung: 3558 })
  })

  it('a Posten without a rolle is an Einnahme (backward-compatible default)', () => {
    expect(calculate(input({ items: [employed] }))).toEqual({ kind: 'bestimmt', einnahmen: 1407, vorsorgeaufwand: 0, anrechnung: 0 })
  })
})

describe('loeseKonflikt — ADR-008 resolution is explicit, never silent', () => {
  const conflict: ItemConflict = {
    itemId: 'p-conflict',
    incomeType: 'Kapital',
    sources: [
      { kind: 'beleg', receiptId: 'b1', amount: 480 },
      { kind: 'eingabe', amount: 500 },
    ],
  }

  it('"eine Quelle wählen" keeps that source’s amount AND origin', () => {
    const items = resolveConflict(conflict, { kind: 'quelle-waehlen', source: { kind: 'beleg', receiptId: 'b1' }, amount: 480 })
    expect(items).toEqual({ id: 'p-conflict', incomeType: 'Kapital', amount: 480, source: { kind: 'beleg', receiptId: 'b1' } })
  })

  it('"Wert korrigieren" produces a fresh manual entry (origin eingabe)', () => {
    const items = resolveConflict(conflict, { kind: 'wert-korrigieren', amount: 490 })
    expect(items).toEqual({ id: 'p-conflict', incomeType: 'Kapital', amount: 490, source: { kind: 'eingabe' } })
  })

  it('rejects a negative corrected value', () => {
    expect(() => resolveConflict(conflict, { kind: 'wert-korrigieren', amount: -1 })).toThrow(RangeError)
  })
})

describe('Quelle — every number carries Herkunft (ADR-014/015)', () => {
  it('the ki-vorschlag Quelle records the suggestion id and the Beleg it came from', () => {
    const source: Source = { kind: 'ki-vorschlag', proposalId: 'v1', receiptId: 'b1' }
    expect(source).toEqual({ kind: 'ki-vorschlag', proposalId: 'v1', receiptId: 'b1' })
  })
})
