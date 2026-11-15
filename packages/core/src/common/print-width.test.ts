import { describe, expect, it } from 'vitest'
import { CHILDCARE_PROVIDER_WIDTH_PT, fitsPrintBox, printedWidthPt } from './print-width'

describe('print width on the forms (ADR-0090)', () => {
  it('measures Helvetica at 10 pt', () => {
    expect(printedWidthPt('Kita')).toBeCloseTo(((667 + 222 + 278 + 556) * 10) / 1000)
    // An unknown character never counts as narrow.
    expect(printedWidthPt('☃')).toBe(10)
  })

  it('a short provider fits the childcare line, a long one does not (real case 2024/2025)', () => {
    expect(fitsPrintBox('Kindertagesstätte Sonnenschein e. V., Hauptstraße 12, 79100 Freiburg im Breisgau', CHILDCARE_PROVIDER_WIDTH_PT)).toBe(false)
    expect(fitsPrintBox('Kita Sonnenschein, Hauptstr. 1, 79100 Freiburg', CHILDCARE_PROVIDER_WIDTH_PT)).toBe(true)
  })
})
