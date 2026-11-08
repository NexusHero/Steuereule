import { describe, expect, it } from 'vitest'
import {
  ASSESSMENT_FIELD_IDS,
  ASSESSMENT_COMPARABLE_FIELDS,
  APPEAL_REASONS,
  assessmentCalculationStatus,
  deserializeAssessmentField,
  appealDeadlineEnd,
  reconcileAssessment,
  isAppealReason,
  isValidAssessmentAmount,
  correctVersion,
  serializeAssessmentField,
  remainingAppealDays,
  type FilingVersion,
} from './assessment'
import type { EmployeeFacts } from '../domains/employee'

// Bescheidprüfung 1.0 (ticket 10.3) — the deterministic core: the Bescheid data model, the
// Abgleich (vs berechne), the Korrektur (copy the eingereichte Fassung + diff) and the Einspruch
// (Frist + Grund). Pure functions only — no I/O (ADR-0004).

describe('BESCHEID_FELDER — the transcribable figures', () => {
  it('lists the five figures in paper order', () => {
    expect(ASSESSMENT_FIELD_IDS).toEqual(['einnahmen', 'vorsorgeaufwand', 'anrechnung', 'festgesetzteSteuer', 'erstattung'])
  })

  it('only the three `berechne` buckets are comparable', () => {
    expect(ASSESSMENT_COMPARABLE_FIELDS).toEqual(['einnahmen', 'vorsorgeaufwand', 'anrechnung'])
  })
})

describe('gleicheBescheidAb — Abgleich Bescheid vs. berechne', () => {
  const status = { kind: 'bestimmt' as const, einnahmen: 50_000, vorsorgeaufwand: 4_000, anrechnung: 1_000 }

  it('reports no deviations when every entered comparable field matches', () => {
    const ab = reconcileAssessment({ einnahmen: 50_000, vorsorgeaufwand: 4_000, anrechnung: 1_000 }, status)
    expect(ab.deviations).toEqual([])
    expect(ab.calculationIncomplete).toBe(false)
  })

  it('lists deviations as a diff, never silent', () => {
    const ab = reconcileAssessment({ einnahmen: 48_000, anrechnung: 1_000 }, status)
    expect(ab.deviations).toEqual([{ field: 'einnahmen', assessment: 48_000, calculated: 50_000, difference: -2_000 }])
  })

  it('ignores a still-offen Bescheid field (no fabricated zero)', () => {
    const ab = reconcileAssessment({ vorsorgeaufwand: 4_000 }, status)
    expect(ab.deviations).toEqual([]) // einnahmen/anrechnung not entered → not compared
  })

  it('flags an incomplete computed side (berechne "offen") as a partial truth', () => {
    const openStatus = { kind: 'offen' as const, einnahmen: 50_000, vorsorgeaufwand: 4_000, anrechnung: 1_000, openItems: 2, conflicts: 0, gated: [], unconfirmedItems: 0, unconfirmedSum: 0 }
    const ab = reconcileAssessment({ einnahmen: 50_000 }, openStatus)
    expect(ab.calculationIncomplete).toBe(true)
    expect(ab.deviations).toEqual([])
  })
})

describe('bescheidBerechnungsstand — the merged computed side', () => {
  const employee: EmployeeFacts = {
    einnahmen: 50_000,
    werbungskosten: 0,
    specialExpenses: 0,
    openItems: 0,
    conflicts: 0,
    gated: [],
    recordedNotCalculated: 0,
  }

  it('merges Angestellte + CH into one bestimmt stand', () => {
    const ch = { kind: 'bestimmt' as const, einnahmen: 80_000, vorsorgeaufwand: 7_000, anrechnung: 3_600 }
    const status = assessmentCalculationStatus(employee, ch)
    expect(status).toEqual({ kind: 'bestimmt', einnahmen: 130_000, vorsorgeaufwand: 7_000, anrechnung: 3_600 })
  })

  it('treats a missing CH fold as zero, without fabricating open items', () => {
    const status = assessmentCalculationStatus(employee, null)
    expect(status).toEqual({ kind: 'bestimmt', einnahmen: 50_000, vorsorgeaufwand: 0, anrechnung: 0 })
  })

  it('is offen when either side is open', () => {
    const chOpen = { kind: 'offen' as const, einnahmen: 80_000, vorsorgeaufwand: 7_000, anrechnung: 3_600, openItems: 1, conflicts: 0, gated: [], unconfirmedItems: 0, unconfirmedSum: 0 }
    const status = assessmentCalculationStatus({ ...employee, openItems: 2 }, chOpen)
    expect(status.kind).toBe('offen')
    if (status.kind === 'offen') expect(status.openItems).toBe(3)
  })
})

describe('korrigiereFassung — Kopie der eingereichten Fassung + Diff (ADR-009)', () => {
  const submitted: FilingVersion = { number: 1, einnahmen: 50_000, vorsorgeaufwand: 4_000, anrechnung: 1_000 }

  it('produces Fassung n+1 as a copy, leaving Fassung n unverändert', () => {
    const { version, deviations } = correctVersion(submitted, [{ field: 'einnahmen', newAmount: 52_000 }])
    expect(version).toEqual({ number: 2, einnahmen: 52_000, vorsorgeaufwand: 4_000, anrechnung: 1_000 })
    expect(deviations).toEqual([{ field: 'einnahmen', before: 50_000, after: 52_000, difference: 2_000 }])
    // Fassung n is untouched — the copy, never the original, was changed.
    expect(submitted.einnahmen).toBe(50_000)
  })

  it('reports only the changed fields as a diff', () => {
    const { deviations } = correctVersion(submitted, [
      { field: 'einnahmen', newAmount: 50_000 }, // unchanged
      { field: 'anrechnung', newAmount: 900 },
    ])
    expect(deviations).toEqual([{ field: 'anrechnung', before: 1_000, after: 900, difference: -100 }])
  })

  it('rejects a negative correction (the figures are whole-euro, >= 0)', () => {
    expect(() => correctVersion(submitted, [{ field: 'einnahmen', newAmount: -1 }])).toThrow(RangeError)
  })
})

describe('einspruchsfristEnde / verbleibendeEinspruchstage — § 355 AO, 1 Monat', () => {
  it('adds one month', () => {
    expect(appealDeadlineEnd('2026-03-15')).toBe('2026-04-15')
  })

  it('rolls over the year', () => {
    expect(appealDeadlineEnd('2026-12-15')).toBe('2027-01-15')
  })

  it('clamps to the last day of the target month (31.01 has no 31.02)', () => {
    expect(appealDeadlineEnd('2026-01-31')).toBe('2026-02-28')
    expect(appealDeadlineEnd('2024-01-31')).toBe('2024-02-29') // leap year
  })

  it('counts whole days from heute (exclusive) to the frist end, negative once abgelaufen', () => {
    expect(remainingAppealDays('2026-03-15', '2026-03-15')).toBe(31) // frist end 2026-04-15
    expect(remainingAppealDays('2026-03-15', '2026-04-15')).toBe(0)
    expect(remainingAppealDays('2026-03-15', '2026-04-16')).toBe(-1)
  })

  it('rejects a malformed date', () => {
    expect(() => appealDeadlineEnd('15.03.2026')).toThrow(RangeError)
  })
})

describe('EINSPRUCHS_GRUENDE — the closed Grund-Auswahl', () => {
  it('offers the three Gründe', () => {
    expect(APPEAL_REASONS).toEqual(['betrag-falsch', 'beleg-nicht-beruecksichtigt', 'sonstiges'])
  })

  it('istEinspruchGrund is total over string', () => {
    expect(isAppealReason('betrag-falsch')).toBe(true)
    expect(isAppealReason('sonstiges')).toBe(true)
    expect(isAppealReason('betrag-falsch')).toBe(true)
    expect(isAppealReason('')).toBe(false)
    expect(isAppealReason('betragfalsch')).toBe(false)
  })
})

describe('Bescheid persistence encoding — offen/unklar/erfasst', () => {
  it('serialises offen/unklar/erfasst and round-trips', () => {
    expect(serializeAssessmentField('einnahmen', null)).toBeNull()
    expect(serializeAssessmentField('einnahmen', 'unklar')).toBe('unklar')
    expect(serializeAssessmentField('einnahmen', 50_000)).toBe('50000')

    expect(deserializeAssessmentField('einnahmen', null)).toBeNull()
    expect(deserializeAssessmentField('einnahmen', 'unklar')).toBe('unklar')
    expect(deserializeAssessmentField('einnahmen', '50000')).toBe(50_000)
  })

  it('allows a signed erstattung (Nachzahlung < 0)', () => {
    expect(serializeAssessmentField('erstattung', -250)).toBe('-250')
    expect(deserializeAssessmentField('erstattung', '-250')).toBe(-250)
  })

  it('rejects a negative amount on a non-signed field', () => {
    expect(isValidAssessmentAmount('einnahmen', -1)).toBe(false)
    expect(isValidAssessmentAmount('erstattung', -1)).toBe(true)
    expect(() => serializeAssessmentField('einnahmen', -1)).toThrow(RangeError)
  })
})
