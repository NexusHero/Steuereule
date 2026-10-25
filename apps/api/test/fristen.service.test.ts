// Fast, no-DB unit tier (ADR-0004): FristenService — the one non-pure input (`heuteInBerlin`,
// the server clock in Europe/Berlin, never the client clock) is tested directly at its
// midnight boundary; the service maps the core's honest 400 for unsupported years and returns
// the structure for a supported one (the stufen-Logik itself is pinned kern-pur in
// packages/core/src/fristen.test.ts). The full real-socket proof lives in
// test/acceptance/req-027-fristen.test.ts.
import { describe, expect, it } from 'vitest'
import { FristenService, heuteInBerlin } from '../src/fristen/fristen.service.js'

describe('heuteInBerlin — the server\'s "heute", never the client clock', () => {
  it('maps a UTC instant to the Berlin calendar day (ISO yyyy-mm-dd)', () => {
    // 2027-06-01T12:00:00Z → 14:00 in Berlin (CEST, UTC+2) — same calendar day.
    expect(heuteInBerlin(new Date('2027-06-01T12:00:00Z'))).toBe('2027-06-01')
  })

  it('crosses the midnight boundary at 22:00 UTC (already the next day in Berlin)', () => {
    // 22:00 UTC is 00:00 the NEXT day in Berlin (CEST) — the boundary must not fall back to the
    // UTC day.
    expect(heuteInBerlin(new Date('2027-05-31T22:00:00Z'))).toBe('2027-06-01')
  })

  it('handles winter time (CET, UTC+1)', () => {
    // 2027-01-01T23:30:00Z → 00:30 on 02.01. in Berlin (CET).
    expect(heuteInBerlin(new Date('2027-01-01T23:30:00Z'))).toBe('2027-01-02')
  })
})

describe('FristenService', () => {
  const service = new FristenService()

  it('returns the structure for a supported year — abgabefrist from the per-year Regelwerk', async () => {
    const dto = await service.getFristen(2026)

    expect(dto.abgabefrist).toBe('2027-07-31')
    expect(dto.heute).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(['keine', 'warnung', 'abgelaufen']).toContain(dto.stufe)
    // The response is self-consistent: verbleibendeTage = frist − heute (the core's arithmetic).
    const tage = (iso: string) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)!
      return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000
    }
    expect(dto.verbleibendeTage).toBe(tage(dto.abgabefrist) - tage(dto.heute))
    expect(dto.verspaetungszuschlag).toEqual({ mindestsatzEur: 25, prozentProMonat: 0.25 })
  })

  it('maps an unsupported year to an honest 400 — never a neighbour year\'s frist', async () => {
    await expect(service.getFristen(2023)).rejects.toThrow('Unsupported tax year for the Abgabefrist')
  })
})
