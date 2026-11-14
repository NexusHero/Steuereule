import { describe, expect, it } from 'vitest'
import {
  LATE_FILING_FEE_MINIMUM_EUR,
  LATE_FILING_FEE_PERCENT_PER_MONTH,
  DEADLINE_WARNING_THRESHOLD_DAYS,
  filingDeadlineFor,
  voluntaryFilingDeadlineFor,
  isFestsetzungsverjaehrt,
  deadlineWarning,
  isSupportedDeadlineYear,
  upcomingTaxDates,
  mandatoryLateFilingSurchargeFrom,
  isLateFilingSurchargeMandatory,
} from './deadlines'

describe('mandatoryLateFilingSurchargeFrom — § 152 Abs. 2 Nr. 1 AO, 14 months after the year', () => {
  it('is the first day after the 14-month mark (for 2025: after 28.02.2027)', () => {
    expect(mandatoryLateFilingSurchargeFrom(2025)).toBe('2027-03-01')
    expect(mandatoryLateFilingSurchargeFrom(2024)).toBe('2026-03-01')
  })

  it('is discretionary up to 28.02. and mandatory from 01.03.', () => {
    expect(isLateFilingSurchargeMandatory(2025, '2026-11-14')).toBe(false)
    expect(isLateFilingSurchargeMandatory(2025, '2027-02-28')).toBe(false)
    expect(isLateFilingSurchargeMandatory(2025, '2027-03-01')).toBe(true)
  })
})

// Ticket 10.7 (M6) — the Fristen-/Verspätungszuschlag-Warnmodus. The Abgabefrist is the explicit
// per-year § 149 Abs. 2 AO table (never "current" values, Produkt-ADR-022); the Warnmodus derives
// keine | warnung (ab 60 Tage) | abgelaufen — a banner input, never a `verspätet` status (ADR-0039).

describe('abgabefristFuer — § 149 Abs. 2 AO, the explicit per-year table', () => {
  it('pins the supported years to statutory deadlines', () => {
    expect(filingDeadlineFor(2022)).toBe('2023-10-02')
    expect(filingDeadlineFor(2023)).toBe('2024-09-02')
    expect(filingDeadlineFor(2024)).toBe('2025-07-31')
    expect(filingDeadlineFor(2025)).toBe('2026-07-31')
    // 31.07.2027 is a Saturday → 02.08.2027 (§ 108 Abs. 3 AO; #450 Teil 6).
    expect(filingDeadlineFor(2026)).toBe('2027-08-02')
  })

  it('throws for an unsupported year — never falls back to a neighbour year', () => {
    expect(() => filingDeadlineFor(2021)).toThrow(RangeError)
    expect(() => filingDeadlineFor(2027)).toThrow(RangeError)
  })

  it('istUnterstuetztesFristenJahr is total over integer years', () => {
    expect(isSupportedDeadlineYear(2022)).toBe(true)
    expect(isSupportedDeadlineYear(2023)).toBe(true)
    expect(isSupportedDeadlineYear(2026)).toBe(true)
    expect(isSupportedDeadlineYear(2021)).toBe(false)
    expect(isSupportedDeadlineYear(2026.5)).toBe(false)
    expect(isSupportedDeadlineYear('2026' as never)).toBe(false)
  })
})

describe('voluntaryFilingDeadlineFor & isFestsetzungsverjaehrt — § 169 Abs. 2 Satz 1 Nr. 2 AO', () => {
  it('returns the statutory 4-year statute of limitations deadline', () => {
    expect(voluntaryFilingDeadlineFor(2022)).toBe('2026-12-31')
    expect(voluntaryFilingDeadlineFor(2023)).toBe('2027-12-31')
    expect(voluntaryFilingDeadlineFor(2024)).toBe('2029-01-02')
    expect(voluntaryFilingDeadlineFor(2025)).toBe('2029-12-31')
    expect(voluntaryFilingDeadlineFor(2026)).toBe('2030-12-31')
  })

  it('identifies whether voluntary filing is verjährt', () => {
    // 2022: Frist 31.12.2026
    expect(isFestsetzungsverjaehrt(2022, '2026-11-08')).toBe(false)
    expect(isFestsetzungsverjaehrt(2022, '2026-12-31')).toBe(false)
    expect(isFestsetzungsverjaehrt(2022, '2027-01-01')).toBe(true)
  })
})

describe('fristenWarnung — the derived warning stage (ADR-0039, never a status)', () => {
  it('is keine more than 60 days before the frist', () => {
    // 02.08.2027 minus 61 Tage = 02.06.2027.
    const warning = deadlineWarning(2026, '2027-06-02')
    expect(warning).toEqual({ level: 'keine', filingDeadline: '2027-08-02', remainingDays: 61 })
  })

  it('is warnung from 60 days before the frist (inclusive)', () => {
    const warning = deadlineWarning(2026, '2027-06-03') // 60 Tage vor dem 02.08.
    expect(warning).toEqual({ level: 'warnung', filingDeadline: '2027-08-02', remainingDays: 60 })
  })

  it('is warnung on the frist day itself — 0 days remaining is not yet abgelaufen', () => {
    const warning = deadlineWarning(2026, '2027-08-02')
    expect(warning).toEqual({ level: 'warnung', filingDeadline: '2027-08-02', remainingDays: 0 })
  })

  it('is abgelaufen the day after the frist — the honest banner input, never a verspätet status', () => {
    const warning = deadlineWarning(2026, '2027-08-03')
    expect(warning).toEqual({ level: 'abgelaufen', filingDeadline: '2027-08-02', remainingDays: -1 })
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

describe('upcoming tax dates', () => {
  it('names the dates of the next 90 days in order, from the law and practice only', () => {
    const dates = upcomingTaxDates(2025, '2026-11-13')
    expect(dates.map((entry) => entry.date)).toEqual(['2026-12-10', '2026-12-15', '2026-12-31'])
    expect(dates[1]!.label).toContain('Verlustbescheinigung')
    expect(dates[2]!.label).toContain('noch für 2026')
  })

  it('includes the filing deadline of the tax year in view when it comes up', () => {
    expect(upcomingTaxDates(2025, '2026-06-01').map((entry) => entry.date)).toEqual(['2026-06-10', '2026-07-31'])
  })

  it('leaves out what has passed', () => {
    expect(upcomingTaxDates(2025, '2026-12-16').map((entry) => entry.date)).toEqual(['2026-12-31', '2027-03-10'])
  })
})
