import type { Source } from '../engine/berechnung'

/** `amtlich`: BMF monthly rate; `jahresdurchschnitt`: the annual average printed on Anlage N-Gre; `tatsaechlich`: with a Beleg. */
export type ExchangeRateMode = 'amtlich' | 'jahresdurchschnitt' | 'tatsaechlich'

/** A CHF→EUR exchange rate with its provenance. */
export interface ExchangeRate {
  /** `yyyy-mm` for a monthly rate, `yyyy` for the annual average. */
  readonly month: string
  readonly rate: number
  readonly mode: ExchangeRateMode
  readonly receiptId?: string
}

const MONTH = /^\d{4}-\d{2}$/

function validate(month: string, rate: number): void {
  if (!MONTH.test(month)) throw new RangeError('monat must be yyyy-mm')
  if (!Number.isFinite(rate) || rate <= 0) throw new RangeError('kurs must be a positive finite number')
}

export function officialMonthlyRate(month: string, rate: number): ExchangeRate {
  validate(month, rate)
  return { month, rate, mode: 'amtlich' }
}

/**
 * EUR per CHF of the Jahresdurchschnittskurs as printed under Zeile 25 of Anlage N-Gre of each year
 * ("100 CHF = 106,50 €" in 2025). Using it instead of the monthly rates is a simplification the
 * taxpayer may choose (ELSTER-Hilfe zur Anlage N-Gre 2025).
 */
export const ANNUAL_AVERAGE_RATES: Readonly<Record<number, number>> = { 2022: 0.99, 2023: 1.025, 2024: 1.045, 2025: 1.065 }

export function annualAverageRate(year: string, rate: number): ExchangeRate {
  if (!/^\d{4}$/.test(year)) throw new RangeError('jahr must be yyyy')
  validate(`${year}-01`, rate)
  return { month: year, rate, mode: 'jahresdurchschnitt' }
}

export function actualRate(month: string, rate: number, receiptId: string): ExchangeRate {
  validate(month, rate)
  if (receiptId === '') throw new RangeError('a tatsächlicher Kurs requires a Beleg (ADR-012)')
  return { month, rate, mode: 'tatsaechlich', receiptId }
}

export function allowedModes(hasReceipt: boolean): readonly ExchangeRateMode[] {
  return hasReceipt ? (['amtlich', 'tatsaechlich'] as const) : (['amtlich'] as const)
}

export function chfToEur(amountChf: number, rate: number): number {
  if (!Number.isFinite(amountChf) || amountChf < 0) {
    throw new RangeError('betragChf must be a non-negative finite number')
  }
  if (!Number.isFinite(rate) || rate <= 0) throw new RangeError('kurs must be a positive finite number')
  return Math.round(amountChf * rate * 100) / 100
}

export function exchangeRateSource(rate: ExchangeRate): Source {
  if (rate.mode === 'amtlich') return { kind: 'regel', rule: 'BMF-Monatskurs' }
  if (rate.mode === 'jahresdurchschnitt') return { kind: 'regel', rule: 'BMF-Jahresdurchschnittskurs' }
  return { kind: 'beleg', receiptId: rate.receiptId as string }
}
