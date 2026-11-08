import { describe, expect, it } from 'vitest'
import { confirmLineItem, adoptionProvenance, adoptedLineItem } from './takeover'
import { calculate } from '../engine/berechnung'
import { calculateCockpitRange } from '../interview/cockpit-range'
import { UNCERTAINTY_PER_ITEM } from '../interview/cockpit'
import type { Item } from '../engine/berechnung'

// Ticket 10.8 (M1) — die Jahresübernahme (Produkt-ADR-021): kopierte Posten tragen die Herkunft
// „Übernahme aus {Vorjahr}" und sind UNBESTÄTIGT, bis sie angetippt werden; unbestätigte zählen
// in die Spanne, nie in den Punktwert.

const ITEMS: Item = {
  id: 'lstb',
  incomeType: 'Nichtselbstständig',
  amount: 50000,
  source: { kind: 'eingabe' },
}

describe('uebernommenerPosten — der Kopier-Schritt (ADR-021)', () => {
  it('übernimmt Betrag/Einkunftsart/Rolle, setzt die Herkunft „Übernahme aus {Vorjahr}" und das unbestätigt-Flag', () => {
    const takenOver = adoptedLineItem(ITEMS, 2025)
    expect(takenOver).toEqual({
      ...ITEMS,
      source: { kind: 'uebernahme', lastYear: 2025 },
      unconfirmed: true,
    })
  })

  it('wirft für ein ungültiges Vorjahr — nie ein geratenes Nachbarjahr', () => {
    expect(() => adoptedLineItem(ITEMS, 2025.5)).toThrow(RangeError)
    expect(() => adoptedLineItem(ITEMS, -1)).toThrow(RangeError)
  })
})

describe('bestaetigePosten — der Bestätigungs-Schritt (angetippt/Beleg)', () => {
  it('entfernt das unbestätigt-Flag, die Übernahme-Herkunft BLEIBT', () => {
    const confirmed = confirmLineItem(adoptedLineItem(ITEMS, 2025))
    expect(confirmed.unconfirmed).toBe(false)
    expect(confirmed.source).toEqual({ kind: 'uebernahme', lastYear: 2025 })
  })

  it('ist idempotent für bereits bestätigte und normale Posten', () => {
    expect(confirmLineItem(ITEMS)).toEqual(ITEMS)
    expect(confirmLineItem(confirmLineItem(adoptedLineItem(ITEMS, 2025)))).toEqual(confirmLineItem(adoptedLineItem(ITEMS, 2025)))
  })
})

describe('uebernahmeHerkunft — der Herkunfts-Chip mit Jahresbezug (ADR-022)', () => {
  it('zitiert das Vorjahr', () => {
    expect(adoptionProvenance(2025)).toBe('Übernahme aus 2025')
  })

  it('wirft für ein ungültiges Jahr', () => {
    expect(() => adoptionProvenance(0.5)).toThrow(RangeError)
  })
})

describe('berechne — unbestätigte Posten (ADR-021: Spanne statt Punktwert)', () => {
  it('ein unbestätigter Posten versagt den Punktwert und wird ruhig benannt', () => {
    const status = calculate({ items: [adoptedLineItem(ITEMS, 2025)], openItems: 0, conflicts: [], gated: [] })
    expect(status).toEqual({
      kind: 'offen',
      einnahmen: 50000,
      vorsorgeaufwand: 0,
      anrechnung: 0,
      openItems: 0,
      conflicts: 0,
      gated: [],
      unconfirmedItems: 1,
      unconfirmedSum: 50000,
    })
  })

  it('bestätigte Übernahme-Posten ergeben wieder den Punktwert', () => {
    const status = calculate({ items: [confirmLineItem(adoptedLineItem(ITEMS, 2025))], openItems: 0, conflicts: [], gated: [] })
    expect(status).toEqual({ kind: 'bestimmt', einnahmen: 50000, vorsorgeaufwand: 0, anrechnung: 0 })
  })
})

describe('cockpitSpanne — die Übernahme weitet die Spanne um ihre Summe', () => {
  it('unbestätigte 50.000 € weiten die Spanne um genau diese Summe (ruhig, kein Konflikt)', () => {
    const status = calculate({ items: [adoptedLineItem(ITEMS, 2025)], openItems: 0, conflicts: [], gated: [] })
    const range = calculateCockpitRange(status)
    expect(range).toEqual({
      kind: 'spanne',
      from: 0,
      to: 50000 + 50000,
      openItems: 0,
      conflicts: 0,
      unconfirmedItems: 1,
      unconfirmedSum: 50000,
    })
  })

  it('offene Posten UND Übernahme addieren ihre Unsicherheiten', () => {
    const status = calculate({ items: [adoptedLineItem(ITEMS, 2025)], openItems: 2, conflicts: [], gated: [] })
    const range = calculateCockpitRange(status)
    const uncertainty = 2 * UNCERTAINTY_PER_ITEM + 50000
    expect(range).toEqual({
      kind: 'spanne',
      from: 0,
      to: 50000 + uncertainty,
      openItems: 2,
      conflicts: 0,
      unconfirmedItems: 1,
      unconfirmedSum: 50000,
    })
  })
})
