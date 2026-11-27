import { describe, expect, it } from 'vitest'
import { isAmountLine } from '../src/mcp/tools/comfort-tools.js'

describe('which printed values vordruck_zeilen shows the assistant', () => {
  it('shows Kennzahl amounts and the numbered lines of the Anlage N-Gre: tax-free benefits, the social split, the premium split', () => {
    for (const id of ['anlN.kz110', 'anlNGre.z8Chf', 'anlNGre.z9Eur', 'anlNGre.z77Chf', 'anlNGre.z88Eur', 'anlNGre.z95Arbeitgeber', 'anlNGre.z98Arbeitnehmer']) {
      expect(isAmountLine(id, '1234'), id).toBe(true)
    }
  })

  it('keeps names, addresses, text lines and checkmarks out', () => {
    expect(isAmountLine('anlNGre.arbeitgeberName', 'Muster AG')).toBe(false)
    expect(isAmountLine('anlNGre.z48Text', 'Gewerkschaft')).toBe(false)
    expect(isAmountLine('anlNGre.wegOrt', '4051')).toBe(false)
    expect(isAmountLine('anlNGre.personA', true)).toBe(false)
    expect(isAmountLine('anlNGre.z9Chf', 'Muster')).toBe(false)
  })
})
