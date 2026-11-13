import { describe, expect, it } from 'vitest'
import { childcarePeriod, looksLikeChildcareNotice } from './childcare-notice'

// Invented notices in the shapes youth offices and Kitas print (ADR-0086).
const NOTICE = 'Landratsamt Beispielkreis – Jugendamt\nBewilligungs- und Kostenbeitragsbescheid Kindertagespflege\nDer Kostenbeitrag beträgt ab 01.09.2024 monatlich 250,00 EUR.'

describe('childcarePeriod', () => {
  it('takes the start of care and runs to the end of the year', () => {
    expect(childcarePeriod(NOTICE, 2024)).toEqual({ from: '01.09.2024', to: '31.12.2024' })
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
