import { describe, expect, it } from 'vitest'
import { ordneZu, steuerjahrVorschlag, zuordnungAusDaten, type BelegDaten } from './beleg'

// ADR-007/008 — the receipt inbox. The load-bearing properties: (1) a Beleg lands unbound,
// (2) the year suggestion prefers the payment date over the invoice date (§ 11 EStG
// Zufluss/Abfluss), (3) assigning a year that contradicts the dates yields a visible
// KONFLIKT, never a silent overwrite.

function beleg(overrides: Partial<BelegDaten> = {}): BelegDaten {
  return {
    id: 'beleg-1',
    userId: 'person-1',
    dateiname: 'miete-januar.pdf',
    steuerjahr: null,
    ...overrides,
  }
}

describe('steuerjahrVorschlag — § 11 EStG: payment date fixes the year, not the invoice date (ADR-007)', () => {
  it('prefers the payment date’s year', () => {
    const daten = beleg({ belegdatum: '2025-12-20', zahlungsdatum: '2026-01-15' })
    expect(steuerjahrVorschlag(daten)).toEqual({ steuerjahr: 2026, herkunft: 'zahlungsdatum' })
  })

  it('falls back to the invoice date’s year when there is no payment date', () => {
    const daten = beleg({ belegdatum: '2025-12-20' })
    expect(steuerjahrVorschlag(daten)).toEqual({ steuerjahr: 2025, herkunft: 'belegdatum' })
  })

  it('returns no suggestion when there are no dates at all', () => {
    expect(steuerjahrVorschlag(beleg())).toBeNull()
  })

  it('the cross-year case is exactly the silent-error ADR-007 names: invoice Dec 2025, paid Jan 2026 → 2026', () => {
    // Rechnungsdatum ≠ Zahlungsdatum: a naive "use the invoice year" rule would quietly
    // attribute this to 2025. The rule must return 2026.
    const daten = beleg({ belegdatum: '2025-12-31', zahlungsdatum: '2026-01-02' })
    expect(steuerjahrVorschlag(daten)).toEqual({ steuerjahr: 2026, herkunft: 'zahlungsdatum' })
  })

  it('a malformed date yields no suggestion rather than a wrong year', () => {
    expect(steuerjahrVorschlag(beleg({ belegdatum: 'nicht-ein-datum' }))).toBeNull()
  })
})

describe('zuordnungAusDaten — the derived state', () => {
  it('no dates, no confirmed year → ungebunden (ADR-007: lands in the inbox unbound)', () => {
    expect(zuordnungAusDaten(beleg())).toEqual({ kind: 'ungebunden' })
  })

  it('a date but no confirmed year → vorgeschlagen with the rule’s origin', () => {
    const daten = beleg({ zahlungsdatum: '2026-03-01' })
    expect(zuordnungAusDaten(daten)).toEqual({ kind: 'vorgeschlagen', vorschlag: { steuerjahr: 2026, herkunft: 'zahlungsdatum' } })
  })

  it('a confirmed year that matches the suggestion → zugeordnet', () => {
    const daten = beleg({ zahlungsdatum: '2026-03-01', steuerjahr: 2026 })
    expect(zuordnungAusDaten(daten)).toEqual({ kind: 'zugeordnet', steuerjahr: 2026 })
  })

  it('a confirmed year that contradicts the dates → konflikt, BOTH years visible (ADR-008)', () => {
    const daten = beleg({ zahlungsdatum: '2026-01-15', steuerjahr: 2025 })
    expect(zuordnungAusDaten(daten)).toEqual({
      kind: 'konflikt',
      zugeordnet: 2025,
      vorschlag: { steuerjahr: 2026, herkunft: 'zahlungsdatum' },
    })
  })
})

describe('ordneZu — the one assignment operation (tap or manual), conflict is derived, never silent', () => {
  it('sets the confirmed year on an unbound Beleg', () => {
    const zugeordnet = ordneZu(beleg(), 2026)
    expect(zuordnungAusDaten(zugeordnet)).toEqual({ kind: 'zugeordnet', steuerjahr: 2026 })
  })

  it('assigning a year that contradicts the dates persists the year and REPORTS konflikt, without overwriting the dates', () => {
    const daten = beleg({ zahlungsdatum: '2026-01-15' })
    const zugeordnet = ordneZu(daten, 2025)

    expect(zuordnungAusDaten(zugeordnet)).toEqual({
      kind: 'konflikt',
      zugeordnet: 2025,
      vorschlag: { steuerjahr: 2026, herkunft: 'zahlungsdatum' },
    })
    // The facts that caused the conflict are still there — nothing was silently discarded.
    expect(zugeordnet.zahlungsdatum).toBe('2026-01-15')
    expect(zugeordnet.steuerjahr).toBe(2025)
  })

  it('confirming the suggestion (assigning the suggested year) resolves to zugeordnet, not konflikt', () => {
    const daten = beleg({ zahlungsdatum: '2026-01-15' })
    expect(zuordnungAusDaten(ordneZu(daten, 2026))).toEqual({ kind: 'zugeordnet', steuerjahr: 2026 })
  })

  it('rejects a non-integer year', () => {
    expect(() => ordneZu(beleg(), 2026.5)).toThrow(RangeError)
  })
})
