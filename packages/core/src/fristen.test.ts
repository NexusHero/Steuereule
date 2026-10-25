import { describe, expect, it } from 'vitest'
import {
  VERSPAETUNGSZUSCHLAG_MINDESTSATZ_EUR,
  VERSPAETUNGSZUSCHLAG_PROZENT_PRO_MONAT,
  WARN_SCHWELLE_TAGE,
  abgabefristFuer,
  fristenWarnung,
  istUnterstuetztesFristenJahr,
} from './fristen'

// Ticket 10.7 (M6) — the Fristen-/Verspätungszuschlag-Warnmodus. The Abgabefrist is the explicit
// per-year § 149 Abs. 2 AO table (never "current" values, Produkt-ADR-022); the Warnmodus derives
// keine | warnung (ab 60 Tage) | abgelaufen — a banner input, never a `verspätet` status (ADR-0039).

describe('abgabefristFuer — § 149 Abs. 2 AO, the explicit per-year table', () => {
  it('pins the three supported years to 31 July of the following year', () => {
    expect(abgabefristFuer(2024)).toBe('2025-07-31')
    expect(abgabefristFuer(2025)).toBe('2026-07-31')
    expect(abgabefristFuer(2026)).toBe('2027-07-31')
  })

  it('throws for an unsupported year — never falls back to a neighbour year', () => {
    expect(() => abgabefristFuer(2023)).toThrow(RangeError)
    expect(() => abgabefristFuer(2027)).toThrow(RangeError)
  })

  it('istUnterstuetztesFristenJahr is total over integer years', () => {
    expect(istUnterstuetztesFristenJahr(2026)).toBe(true)
    expect(istUnterstuetztesFristenJahr(2023)).toBe(false)
    expect(istUnterstuetztesFristenJahr(2026.5)).toBe(false)
    expect(istUnterstuetztesFristenJahr('2026' as never)).toBe(false)
  })
})

describe('fristenWarnung — the derived warning stage (ADR-0039, never a status)', () => {
  it('is keine more than 60 days before the frist', () => {
    // 31.07.2027 minus 61 Tage = 31.05.2027.
    const warnung = fristenWarnung(2026, '2027-05-31')
    expect(warnung).toEqual({ stufe: 'keine', abgabefrist: '2027-07-31', verbleibendeTage: 61 })
  })

  it('is warnung from 60 days before the frist (inclusive)', () => {
    const warnung = fristenWarnung(2026, '2027-06-01') // 60 Tage vor dem 31.07.
    expect(warnung).toEqual({ stufe: 'warnung', abgabefrist: '2027-07-31', verbleibendeTage: 60 })
  })

  it('is warnung on the frist day itself — 0 days remaining is not yet abgelaufen', () => {
    const warnung = fristenWarnung(2026, '2027-07-31')
    expect(warnung).toEqual({ stufe: 'warnung', abgabefrist: '2027-07-31', verbleibendeTage: 0 })
  })

  it('is abgelaufen the day after the frist — the honest banner input, never a verspätet status', () => {
    const warnung = fristenWarnung(2026, '2027-08-01')
    expect(warnung).toEqual({ stufe: 'abgelaufen', abgabefrist: '2027-07-31', verbleibendeTage: -1 })
  })

  it('spans a year boundary in whole days (2025 frist: 31.07.2026)', () => {
    const warnung = fristenWarnung(2025, '2026-07-31')
    expect(warnung).toEqual({ stufe: 'warnung', abgabefrist: '2026-07-31', verbleibendeTage: 0 })
  })

  it('throws on a malformed heute — a fact, not a free string', () => {
    expect(() => fristenWarnung(2026, 'irgendwann')).toThrow(RangeError)
  })
})

describe('the cited § 152 Abs. 2 AO figures — constants the banner renders nüchtern (ADR-023)', () => {
  it('pins the statutory minimum and rate', () => {
    expect(VERSPAETUNGSZUSCHLAG_MINDESTSATZ_EUR).toBe(25)
    expect(VERSPAETUNGSZUSCHLAG_PROZENT_PRO_MONAT).toBe(0.25)
    expect(WARN_SCHWELLE_TAGE).toBe(60)
  })
})
