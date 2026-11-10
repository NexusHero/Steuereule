import { describe, expect, it } from 'vitest'
import { formatCalculation } from './formatCalculation'

const term = (line: string, amount: string) => `Zeile ${line} (${amount})`

describe('formatCalculation', () => {
  it('joins the summands with their German Euro amounts', () => {
    const formatted = (
      formatCalculation(
        [
          { line: '23a', amount: 5051.76 },
          { line: '25', amount: 4182.64 },
        ],
        term,
      ) ?? ''
    ).replace(/\u00a0/g, ' ')
    // Intl separates amount and € with a no-break space; normalised for readability here.
    expect(formatted).toBe('Zeile 23a (5.051,76 €) + Zeile 25 (4.182,64 €)')
  })

  it('returns null when nothing was read', () => {
    expect(formatCalculation([], term)).toBeNull()
  })
})
