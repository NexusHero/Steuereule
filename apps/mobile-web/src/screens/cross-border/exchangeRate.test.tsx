import { describe, expect, it } from 'vitest'
import { eurPerHundredChf, exchangeRateToSave, monthLabel, rateText } from './exchangeRate'

describe('rateText and eurPerHundredChf', () => {
  it('write the rate with a decimal comma', () => {
    expect(rateText(1.0712)).toBe('1,0712')
    expect(eurPerHundredChf(1.0712)).toBe('107,12')
    expect(eurPerHundredChf(0.95)).toBe('95,00')
  })
})

describe('monthLabel', () => {
  it('names the month in the UI language', () => {
    expect(monthLabel(2026, '05', 'de')).toBe('Mai')
    expect(monthLabel(2026, '12', 'en')).toBe('Dec')
  })
})

describe('exchangeRateToSave', () => {
  it('saves a month of the tax year as the official rate', () => {
    expect(exchangeRateToSave('2026-03', '1,07', 2026)).toEqual({ month: '2026-03', rate: 1.07, mode: 'amtlich' })
  })

  it('saves the tax year itself as the annual average', () => {
    expect(exchangeRateToSave('2026', ' 1.05 ', 2026)).toEqual({ month: '2026', rate: 1.05, mode: 'jahresdurchschnitt' })
  })

  it.each([
    ['', '1,07'],
    ['2026-13', '1,07'],
    ['2026-03', ''],
    ['2026-03', '0'],
    ['2026-03', 'abc'],
  ])('rejects month %j with rate %j', (month, rate) => {
    expect(exchangeRateToSave(month, rate, 2026)).toBeNull()
  })
})
