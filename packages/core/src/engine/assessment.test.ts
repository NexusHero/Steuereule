import { describe, expect, it } from 'vitest'
import {
  ASSESSMENT_FIELD_IDS,
  ASSESSMENT_COMPARABLE_FIELDS,
  APPEAL_REASONS,
  assessmentCalculationStatus,
  deserializeAssessmentField,
  appealDeadlineEnd,
  noticeReceivedOn,
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

describe('einspruchsfristEnde / verbleibendeEinspruchstage — § 355 AO, 1 Monat ab Bekanntgabe', () => {
  it('counts the notice as received on the fourth day after posting from 2025 on, the third before (§ 122 Abs. 2 AO)', () => {
    // Mo 16.03.2026 + 4 = Fr 20.03.2026.
    expect(noticeReceivedOn('2026-03-16')).toBe('2026-03-20')
    // Mo 11.03.2024 + 3 = Do 14.03.2024.
    expect(noticeReceivedOn('2024-03-11')).toBe('2024-03-14')
  })

  it('moves a deemed day on a weekend or holiday to the next working day', () => {
    // Mi 18.03.2026 + 4 = So 22.03.2026 → Mo 23.03.2026.
    expect(noticeReceivedOn('2026-03-18')).toBe('2026-03-23')
    // Fr 27.03.2026 + 4 = Di 31.03.2026, no shift; Mo 30.03.2026 + 4 = Fr 03.04.2026 = Karfreitag → Ostermontag 06.04. too → Di 07.04.
    expect(noticeReceivedOn('2026-03-30')).toBe('2026-04-07')
  })

  it('ends one month after the notice was received, on a working day', () => {
    // Received Fr 20.03.2026 → Mo 20.04.2026.
    expect(appealDeadlineEnd('2026-03-16')).toBe('2026-04-20')
    // Received Mo 23.03.2026 → Do 23.04.2026.
    expect(appealDeadlineEnd('2026-03-18')).toBe('2026-04-23')
    // Received Mi 18.03.2026 (Sa 14.03. + 4) → Sa 18.04.2026 → Mo 20.04.2026.
    expect(appealDeadlineEnd('2026-03-14')).toBe('2026-04-20')
  })

  it('rolls over the year and clamps to the last day of a shorter month', () => {
    // Di 15.12.2026 + 4 = Sa 19.12. → Mo 21.12.2026 → Do 21.01.2027.
    expect(appealDeadlineEnd('2026-12-15')).toBe('2027-01-21')
    // Mo 26.01.2026 + 4 = Fr 30.01.2026 → 30.02. does not exist → Sa 28.02.2026 → Mo 02.03.2026.
    expect(appealDeadlineEnd('2026-01-26')).toBe('2026-03-02')
  })

  it('knows the holidays of the state when it is given, and only nationwide ones without it', () => {
    // Do 31.12.2026: Mi 25.11.2026 + 4 = So 29.11. → Mo 30.11.2026 → Mi 30.12.2026 everywhere.
    expect(appealDeadlineEnd('2026-11-25')).toBe('2026-12-30')
    // Fronleichnam Do 04.06.2026 is a holiday in NRW, not in Berlin: received Mo 04.05.2026 (Do 30.04. + 4).
    expect(noticeReceivedOn('2026-04-30')).toBe('2026-05-04')
    expect(appealDeadlineEnd('2026-04-30', 'NW')).toBe('2026-06-05')
    expect(appealDeadlineEnd('2026-04-30', 'BE')).toBe('2026-06-04')
    expect(appealDeadlineEnd('2026-04-30')).toBe('2026-06-04')
  })

  it('counts whole days from heute (exclusive) to the frist end, negative once abgelaufen', () => {
    expect(remainingAppealDays('2026-03-16', '2026-03-16')).toBe(35) // frist end 2026-04-20
    expect(remainingAppealDays('2026-03-16', '2026-04-20')).toBe(0)
    expect(remainingAppealDays('2026-03-16', '2026-04-21')).toBe(-1)
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
