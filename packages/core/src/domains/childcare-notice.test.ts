import { describe, expect, it } from 'vitest'
import { childNamedIn, childcarePeriod, looksLikeChildcareNotice } from './childcare-notice'

// Invented notices in the shapes youth offices and Kitas print (ADR-0086).
const NOTICE = 'Landratsamt Beispielkreis – Jugendamt\nBewilligungs- und Kostenbeitragsbescheid Kindertagespflege\nDer Kostenbeitrag beträgt ab 01.09.2024 monatlich 250,00 EUR.'

describe('childcarePeriod', () => {
  it('takes the start of care and runs to the end of the year', () => {
    expect(childcarePeriod(NOTICE, 2024)).toEqual({ from: '01.09.2024', to: '31.12.2024' })
  })

  it('reads the limit that follows the start („befristet bis“), into the next year too', () => {
    const limited = `${NOTICE}\nDie Bewilligung ist befristet bis 31.05.2025.`
    expect(childcarePeriod(limited, 2024)).toEqual({ from: '01.09.2024', to: '31.12.2024' })
    expect(childcarePeriod(limited, 2025)).toEqual({ from: '01.01.2025', to: '31.05.2025' })
    expect(childcarePeriod(limited, 2026)).toBeNull()
  })

  it('cuts a period to the tax year', () => {
    const kita = 'Kita Sonnenschein, Elternbeitrag für die Betreuung vom 01.09.2023 bis 31.07.2025'
    expect(childcarePeriod(kita, 2024)).toEqual({ from: '01.01.2024', to: '31.12.2024' })
    expect(childcarePeriod(kita, 2025)).toEqual({ from: '01.01.2025', to: '31.07.2025' })
  })

  it('finds nothing outside the year or in other documents', () => {
    expect(childcarePeriod(NOTICE, 2023)).toBeNull()
    expect(childcarePeriod('Rechnung Elektro ab 01.09.2024', 2024)).toBeNull()
    expect(looksLikeChildcareNotice('Spendenbestätigung')).toBe(false)
  })
})

describe('childNamedIn', () => {
  const kids = [{ id: 'k1', firstName: 'Lea Marie' }, { id: 'k2', firstName: 'Tom' }]
  it('finds the child the notice names', () => {
    expect(childNamedIn('Betreuung für das Kind Tom Muster ab 01.09.2024', kids)).toBe('k2')
    expect(childNamedIn('Kind: LEA MARIE MUSTER', kids)).toBe('k1')
  })
  it('leaves it open when no child or both are named, and takes the only child', () => {
    expect(childNamedIn('Kostenbeitrag Kindertagespflege', kids)).toBeNull()
    expect(childNamedIn('Lea Marie und Tom', kids)).toBeNull()
    expect(childNamedIn('irgendein Text', [{ id: 'k1', firstName: 'Lea' }])).toBe('k1')
  })
})
