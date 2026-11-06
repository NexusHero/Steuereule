import { describe, expect, it } from 'vitest'
import {
  officialMonthlyRate,
  chfToEur,
  allowedModes,
  actualRate,
  exchangeRateSource,
} from './wechselkurs'

// ADR-012/036 — the Wechselkurs: amtlich is the default (no Beleg), tatsächlich is only
// representable WITH a Beleg; the conversion is deterministic and carries provenance.

describe('amtlicherMonatskurs / tatsaechlicherKurs — ADR-012', () => {
  it('the amtliche Kurs is the default and carries no Beleg', () => {
    expect(officialMonthlyRate('2026-01', 0.9412)).toEqual({ month: '2026-01', rate: 0.9412, mode: 'amtlich' })
  })

  it('the tatsächliche Kurs REQUIRES a Beleg — belegId is mandatory', () => {
    expect(actualRate('2026-01', 0.92, 'beleg-7')).toEqual({
      month: '2026-01',
      rate: 0.92,
      mode: 'tatsaechlich',
      receiptId: 'beleg-7',
    })
  })

  it('"ohne Beleg kein tatsächlicher Kurs" — an empty belegId throws (ADR-012 is a type, not a hope)', () => {
    expect(() => actualRate('2026-01', 0.92, '')).toThrow(RangeError)
  })

  it('rejects a malformed month and a non-positive rate', () => {
    expect(() => officialMonthlyRate('01-2026', 0.94)).toThrow(RangeError)
    expect(() => officialMonthlyRate('2026-01', 0)).toThrow(RangeError)
    expect(() => officialMonthlyRate('2026-01', -1)).toThrow(RangeError)
  })
})

describe('erlaubteModi — the two-state UI (ADR-012)', () => {
  it('without a Beleg only the amtliche Kurs is offered', () => {
    expect(allowedModes(false)).toEqual(['amtlich'])
  })

  it('with a Beleg both are offered, amtlich first (the default)', () => {
    expect(allowedModes(true)).toEqual(['amtlich', 'tatsaechlich'])
  })
})

describe('chfNachEur — ADR-036 CHF führt, EUR daneben', () => {
  it('converts at the BMF example rate (8400 CHF × 0.9412 = 7906.08 EUR), whole cents', () => {
    expect(chfToEur(8400, 0.9412)).toBe(7906.08)
  })

  it('rounds half-up to whole cents, deterministically (positive amounts only)', () => {
    expect(chfToEur(100, 0.9412)).toBe(94.12)
    expect(chfToEur(1, 0.005)).toBe(0.01) // 0.005 rounds up to 0.01
  })

  it('rejects a negative or non-finite CHF amount', () => {
    expect(() => chfToEur(-1, 0.94)).toThrow(RangeError)
    expect(() => chfToEur(Number.NaN, 0.94)).toThrow(RangeError)
  })
})

describe('wechselkursQuelle — ADR-014/015 jede Zahl trägt Herkunft', () => {
  it('amtlich → regel (BMF-Monatskurs)', () => {
    expect(exchangeRateSource(officialMonthlyRate('2026-01', 0.9412))).toEqual({ art: 'regel', rule: 'BMF-Monatskurs' })
  })

  it('tatsächlich → beleg (the Kontoauszug)', () => {
    expect(exchangeRateSource(actualRate('2026-01', 0.92, 'beleg-7'))).toEqual({ art: 'beleg', receiptId: 'beleg-7' })
  })
})
