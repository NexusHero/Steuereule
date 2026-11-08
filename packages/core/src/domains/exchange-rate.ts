import type { Source } from '../engine/berechnung'

export type ExchangeRateMode = 'amtlich' | 'tatsaechlich'

/** A CHF→EUR exchange rate with its provenance. */
export interface ExchangeRate {
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
  return { kind: 'beleg', receiptId: rate.receiptId as string }
}
