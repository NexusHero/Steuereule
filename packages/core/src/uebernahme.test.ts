import { describe, expect, it } from 'vitest'
import { bestaetigePosten, uebernahmeHerkunft, uebernommenerPosten } from './uebernahme'
import { berechne } from './berechnung'
import { cockpitSpanne } from './cockpit-spanne'
import { UNCERTAINTY_PER_ITEM } from './cockpit'
import type { Posten } from './berechnung'

// Ticket 10.8 (M1) — die Jahresübernahme (Produkt-ADR-021): kopierte Posten tragen die Herkunft
// „Übernahme aus {Vorjahr}" und sind UNBESTÄTIGT, bis sie angetippt werden; unbestätigte zählen
// in die Spanne, nie in den Punktwert.

const POSTEN: Posten = {
  id: 'lstb',
  einkunftsart: 'Nichtselbstständig',
  betrag: 50000,
  quelle: { art: 'eingabe' },
}

describe('uebernommenerPosten — der Kopier-Schritt (ADR-021)', () => {
  it('übernimmt Betrag/Einkunftsart/Rolle, setzt die Herkunft „Übernahme aus {Vorjahr}" und das unbestätigt-Flag', () => {
    const uebernommen = uebernommenerPosten(POSTEN, 2025)
    expect(uebernommen).toEqual({
      ...POSTEN,
      quelle: { art: 'uebernahme', vorjahr: 2025 },
      unbestaetigt: true,
    })
  })

  it('wirft für ein ungültiges Vorjahr — nie ein geratenes Nachbarjahr', () => {
    expect(() => uebernommenerPosten(POSTEN, 2025.5)).toThrow(RangeError)
    expect(() => uebernommenerPosten(POSTEN, -1)).toThrow(RangeError)
  })
})

describe('bestaetigePosten — der Bestätigungs-Schritt (angetippt/Beleg)', () => {
  it('entfernt das unbestätigt-Flag, die Übernahme-Herkunft BLEIBT', () => {
    const bestaetigt = bestaetigePosten(uebernommenerPosten(POSTEN, 2025))
    expect(bestaetigt.unbestaetigt).toBe(false)
    expect(bestaetigt.quelle).toEqual({ art: 'uebernahme', vorjahr: 2025 })
  })

  it('ist idempotent für bereits bestätigte und normale Posten', () => {
    expect(bestaetigePosten(POSTEN)).toEqual(POSTEN)
    expect(bestaetigePosten(bestaetigePosten(uebernommenerPosten(POSTEN, 2025)))).toEqual(bestaetigePosten(uebernommenerPosten(POSTEN, 2025)))
  })
})

describe('uebernahmeHerkunft — der Herkunfts-Chip mit Jahresbezug (ADR-022)', () => {
  it('zitiert das Vorjahr', () => {
    expect(uebernahmeHerkunft(2025)).toBe('Übernahme aus 2025')
  })

  it('wirft für ein ungültiges Jahr', () => {
    expect(() => uebernahmeHerkunft(0.5)).toThrow(RangeError)
  })
})

describe('berechne — unbestätigte Posten (ADR-021: Spanne statt Punktwert)', () => {
  it('ein unbestätigter Posten versagt den Punktwert und wird ruhig benannt', () => {
    const stand = berechne({ posten: [uebernommenerPosten(POSTEN, 2025)], offenePosten: 0, konflikte: [], gegated: [] })
    expect(stand).toEqual({
      kind: 'offen',
      einnahmen: 50000,
      vorsorgeaufwand: 0,
      anrechnung: 0,
      offenePosten: 0,
      konflikte: 0,
      gegated: [],
      unbestaetigte: 1,
      unbestaetigteSumme: 50000,
    })
  })

  it('bestätigte Übernahme-Posten ergeben wieder den Punktwert', () => {
    const stand = berechne({ posten: [bestaetigePosten(uebernommenerPosten(POSTEN, 2025))], offenePosten: 0, konflikte: [], gegated: [] })
    expect(stand).toEqual({ kind: 'bestimmt', einnahmen: 50000, vorsorgeaufwand: 0, anrechnung: 0 })
  })
})

describe('cockpitSpanne — die Übernahme weitet die Spanne um ihre Summe', () => {
  it('unbestätigte 50.000 € weiten die Spanne um genau diese Summe (ruhig, kein Konflikt)', () => {
    const stand = berechne({ posten: [uebernommenerPosten(POSTEN, 2025)], offenePosten: 0, konflikte: [], gegated: [] })
    const spanne = cockpitSpanne(stand)
    expect(spanne).toEqual({
      kind: 'spanne',
      von: 0,
      bis: 50000 + 50000,
      offenePosten: 0,
      konflikte: 0,
      unbestaetigte: 1,
      unbestaetigteSumme: 50000,
    })
  })

  it('offene Posten UND Übernahme addieren ihre Unsicherheiten', () => {
    const stand = berechne({ posten: [uebernommenerPosten(POSTEN, 2025)], offenePosten: 2, konflikte: [], gegated: [] })
    const spanne = cockpitSpanne(stand)
    const uncertainty = 2 * UNCERTAINTY_PER_ITEM + 50000
    expect(spanne).toEqual({
      kind: 'spanne',
      von: 0,
      bis: 50000 + uncertainty,
      offenePosten: 2,
      konflikte: 0,
      unbestaetigte: 1,
      unbestaetigteSumme: 50000,
    })
  })
})
