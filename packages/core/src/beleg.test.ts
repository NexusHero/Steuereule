import { describe, expect, it } from 'vitest'
import { assignReceipt, taxYearProposal, dismissSuggestion, assignmentFromData, type ReceiptData } from './beleg'

// ADR-007/008 — the receipt inbox. The load-bearing properties: (1) a Beleg lands unbound,
// (2) the year suggestion prefers the payment date over the invoice date (§ 11 EStG
// Zufluss/Abfluss), (3) assigning a year that contradicts the dates yields a visible
// KONFLIKT, never a silent overwrite.

function receipt(overrides: Partial<ReceiptData> = {}): ReceiptData {
  return {
    id: 'beleg-1',
    userId: 'person-1',
    fileName: 'miete-januar.pdf',
    taxYear: null,
    proposalDismissed: false,
    ...overrides,
  }
}

describe('steuerjahrVorschlag — § 11 EStG: payment date fixes the year, not the invoice date (ADR-007)', () => {
  it('prefers the payment date’s year', () => {
    const data = receipt({ belegdatum: '2025-12-20', zahlungsdatum: '2026-01-15' })
    expect(taxYearProposal(data)).toEqual({ taxYear: 2026, provenance: 'zahlungsdatum' })
  })

  it('falls back to the invoice date’s year when there is no payment date', () => {
    const data = receipt({ belegdatum: '2025-12-20' })
    expect(taxYearProposal(data)).toEqual({ taxYear: 2025, provenance: 'belegdatum' })
  })

  it('returns no suggestion when there are no dates at all', () => {
    expect(taxYearProposal(receipt())).toBeNull()
  })

  it('the cross-year case is exactly the silent-error ADR-007 names: invoice Dec 2025, paid Jan 2026 → 2026', () => {
    // Rechnungsdatum ≠ Zahlungsdatum: a naive "use the invoice year" rule would quietly
    // attribute this to 2025. The rule must return 2026.
    const data = receipt({ belegdatum: '2025-12-31', zahlungsdatum: '2026-01-02' })
    expect(taxYearProposal(data)).toEqual({ taxYear: 2026, provenance: 'zahlungsdatum' })
  })

  it('a malformed date yields no suggestion rather than a wrong year', () => {
    expect(taxYearProposal(receipt({ belegdatum: 'nicht-ein-datum' }))).toBeNull()
  })
})

describe('zuordnungAusDaten — the derived state', () => {
  it('no dates, no confirmed year → ungebunden (ADR-007: lands in the inbox unbound)', () => {
    expect(assignmentFromData(receipt())).toEqual({ kind: 'ungebunden' })
  })

  it('a date but no confirmed year → vorgeschlagen with the rule’s origin', () => {
    const data = receipt({ zahlungsdatum: '2026-03-01' })
    expect(assignmentFromData(data)).toEqual({ kind: 'vorgeschlagen', proposal: { taxYear: 2026, provenance: 'zahlungsdatum' } })
  })

  it('a confirmed year that matches the suggestion → zugeordnet', () => {
    const data = receipt({ zahlungsdatum: '2026-03-01', taxYear: 2026 })
    expect(assignmentFromData(data)).toEqual({ kind: 'zugeordnet', taxYear: 2026 })
  })

  it('a confirmed year that contradicts the dates → konflikt, BOTH years visible (ADR-008)', () => {
    const data = receipt({ zahlungsdatum: '2026-01-15', taxYear: 2025 })
    expect(assignmentFromData(data)).toEqual({
      kind: 'konflikt',
      assigned: 2025,
      proposal: { taxYear: 2026, provenance: 'zahlungsdatum' },
    })
  })

  it('a dismissed suggestion resolves the conflict to zugeordnet on the user’s own year (ADR-008 "bei meinem Jahr bleiben")', () => {
    const data = receipt({ zahlungsdatum: '2026-01-15', taxYear: 2025, proposalDismissed: true })
    expect(assignmentFromData(data)).toEqual({ kind: 'zugeordnet', taxYear: 2025 })
    // The contradicting dates are untouched — nothing was silently overwritten.
    expect(data.zahlungsdatum).toBe('2026-01-15')
  })
})

describe('ordneZu — the one assignment operation (tap or manual), conflict is derived, never silent', () => {
  it('sets the confirmed year on an unbound Beleg', () => {
    const assigned = assignReceipt(receipt(), 2026)
    expect(assignmentFromData(assigned)).toEqual({ kind: 'zugeordnet', taxYear: 2026 })
  })

  it('assigning a year that contradicts the dates persists the year and REPORTS konflikt, without overwriting the dates', () => {
    const data = receipt({ zahlungsdatum: '2026-01-15' })
    const assigned = assignReceipt(data, 2025)

    expect(assignmentFromData(assigned)).toEqual({
      kind: 'konflikt',
      assigned: 2025,
      proposal: { taxYear: 2026, provenance: 'zahlungsdatum' },
    })
    // The facts that caused the conflict are still there — nothing was silently discarded.
    expect(assigned.zahlungsdatum).toBe('2026-01-15')
    expect(assigned.taxYear).toBe(2025)
  })

  it('confirming the suggestion (assigning the suggested year) resolves to zugeordnet, not konflikt', () => {
    const data = receipt({ zahlungsdatum: '2026-01-15' })
    expect(assignmentFromData(assignReceipt(data, 2026))).toEqual({ kind: 'zugeordnet', taxYear: 2026 })
  })

  it('rejects a non-integer year', () => {
    expect(() => assignReceipt(receipt(), 2026.5)).toThrow(RangeError)
  })

  it('a fresh assignment clears a prior dismissal, re-opening the decision', () => {
    const dismissed = receipt({ zahlungsdatum: '2026-01-15', taxYear: 2025, proposalDismissed: true })
    expect(assignmentFromData(dismissed)).toEqual({ kind: 'zugeordnet', taxYear: 2025 })
    // Re-assign to a different year → the dismissal is cleared and the conflict re-derives.
    const reassigned = assignReceipt(dismissed, 2024)
    expect(assignmentFromData(reassigned)).toEqual({
      kind: 'konflikt',
      assigned: 2024,
      proposal: { taxYear: 2026, provenance: 'zahlungsdatum' },
    })
  })
})

describe('verwerfeVorschlag — the "bei meinem Jahr bleiben" resolution (ADR-008)', () => {
  it('persists the dismissal and keeps the confirmed year, resolving the conflict', () => {
    const data = receipt({ zahlungsdatum: '2026-01-15', taxYear: 2025 })
    const dismissed = dismissSuggestion(data)
    expect(dismissed.proposalDismissed).toBe(true)
    expect(dismissed.taxYear).toBe(2025)
    expect(assignmentFromData(dismissed)).toEqual({ kind: 'zugeordnet', taxYear: 2025 })
    // The facts that caused the conflict are still there — nothing was silently discarded.
    expect(dismissed.zahlungsdatum).toBe('2026-01-15')
  })
})
