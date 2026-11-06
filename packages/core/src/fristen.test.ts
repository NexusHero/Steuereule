import { describe, expect, it } from 'vitest'
import {
  LATE_FILING_FEE_MINIMUM_EUR,
  LATE_FILING_FEE_PERCENT_PER_MONTH,
  DEADLINE_WARNING_THRESHOLD_DAYS,
  filingDeadlineFor,
  deadlineWarning,
  isSupportedDeadlineYear,
} from './fristen'

// Ticket 10.7 (M6) — the Fristen-/Verspätungszuschlag-Warnmodus. The Abgabefrist is the explicit
// per-year § 149 Abs. 2 AO table (never "current" values, Produkt-ADR-022); the Warnmodus derives
// keine | warnung (ab 60 Tage) | abgelaufen — a banner input, never a `verspätet` status (ADR-0039).

describe('abgabefristFuer — § 149 Abs. 2 AO, the explicit per-year table', () => {
  it('pins the three supported years to 31 July of the following year', () => {
    expect(filingDeadlineFor(2024)).toBe('2025-07-31')
    expect(filingDeadlineFor(2025)).toBe('2026-07-31')
    expect(filingDeadlineFor(2026)).toBe('2027-07-31')
  })

  it('throws for an unsupported year — never falls back to a neighbour year', () => {
    expect(() => filingDeadlineFor(2023)).toThrow(RangeError)
    expect(() => filingDeadlineFor(2027)).toThrow(RangeError)
  })

  it('istUnterstuetztesFristenJahr is total over integer years', () => {
    expect(isSupportedDeadlineYear(2026)).toBe(true)
    expect(isSupportedDeadlineYear(2023)).toBe(false)
    expect(isSupportedDeadlineYear(2026.5)).toBe(false)
    expect(isSupportedDeadlineYear('2026' as never)).toBe(false)
  })
})

describe('fristenWarnung — the derived warning stage (ADR-0039, never a status)', () => {
  it('is keine more than 60 days before the frist', () => {
    // 31.07.2027 minus 61 Tage = 31.05.2027.
    const warning = deadlineWarning(2026, '2027-05-31')
    expect(warning).toEqual({ level: 'keine', filingDeadline: '2027-07-31', remainingDays: 61 })
  })

  it('is warnung from 60 days before the frist (inclusive)', () => {
    const warning = deadlineWarning(2026, '2027-06-01') // 60 Tage vor dem 31.07.
    expect(warning).toEqual({ level: 'warnung', filingDeadline: '2027-07-31', remainingDays: 60 })
  })

  it('is warnung on the frist day itself — 0 days remaining is not yet abgelaufen', () => {
    const warning = deadlineWarning(2026, '2027-07-31')
    expect(warning).toEqual({ level: 'warnung', filingDeadline: '2027-07-31', remainingDays: 0 })
  })

  it('is abgelaufen the day after the frist — the honest banner input, never a verspätet status', () => {
    const warning = deadlineWarning(2026, '2027-08-01')
    expect(warning).toEqual({ level: 'abgelaufen', filingDeadline: '2027-07-31', remainingDays: -1 })
  })

  it('spans a year boundary in whole days (2025 frist: 31.07.2026)', () => {
    const warning = deadlineWarning(2025, '2026-07-31')
    expect(warning).toEqual({ level: 'warnung', filingDeadline: '2026-07-31', remainingDays: 0 })
  })

  it('throws on a malformed heute — a fact, not a free string', () => {
    expect(() => deadlineWarning(2026, 'irgendwann')).toThrow(RangeError)
  })
})

describe('the cited § 152 Abs. 2 AO figures — constants the banner renders nüchtern (ADR-023)', () => {
  it('pins the statutory minimum and rate', () => {
    expect(LATE_FILING_FEE_MINIMUM_EUR).toBe(25)
    expect(LATE_FILING_FEE_PERCENT_PER_MONTH).toBe(0.25)
    expect(DEADLINE_WARNING_THRESHOLD_DAYS).toBe(60)
  })
})
