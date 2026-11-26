import type { Source } from './calculation'

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

/**
 * The BMF's official monthly rates for the Swiss franc as printed: "1 Euro = x CHF", index 0 = January.
 * Source: BMF, Umsatzsteuer-Umrechnungskurse, the annual Gesamtübersicht (2022: BMF-Schreiben of
 * 2 Feb 2023, 2023: 2 Feb 2024, 2024: 3 Feb 2025, 2025: 3 Feb 2026) and the monthly continued
 * overview for 2026 of 2 Nov 2026 (January to October). Add a month when the BMF publishes it.
 */
export const OFFICIAL_MONTHLY_CHF_PER_EUR: Readonly<Record<number, readonly number[]>> = {
  2022: [1.0401, 1.0461, 1.0245, 1.0211, 1.0355, 1.0245, 0.9876, 0.969, 0.964, 0.9791, 0.9842, 0.9865],
  2023: [0.9961, 0.9905, 0.9908, 0.9846, 0.9751, 0.9764, 0.9663, 0.9588, 0.96, 0.9547, 0.9634, 0.9441],
  2024: [0.9368, 0.9462, 0.9656, 0.9761, 0.983, 0.9616, 0.9676, 0.945, 0.9414, 0.9386, 0.9355, 0.9339],
  2025: [0.9414, 0.9413, 0.9548, 0.937, 0.9356, 0.938, 0.9325, 0.9387, 0.935, 0.9289, 0.929, 0.9332],
  2026: [0.9272, 0.914, 0.9094, 0.9213, 0.9149, 0.9205, 0.9256, 0.9362, 0.943, 0.9282],
}

/** The official monthly rate of `yyyy-mm` as euro per franc, or undefined when the BMF has not published it. */
export function officialMonthlyRateOf(month: string): ExchangeRate | undefined {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new RangeError('monat must be yyyy-mm')
  const chfPerEur = OFFICIAL_MONTHLY_CHF_PER_EUR[Number(month.slice(0, 4))]?.[Number(month.slice(5)) - 1]
  return chfPerEur === undefined ? undefined : officialMonthlyRate(month, 1 / chfPerEur)
}

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
