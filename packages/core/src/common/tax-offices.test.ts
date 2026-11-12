import { describe, expect, it } from 'vitest'
import { suggestTaxOffices } from './tax-offices'
import { TAX_OFFICE_NAMES, TAX_OFFICE_SOURCE, TAX_OFFICE_TABLE } from './tax-offices.data'

describe('Finanzamt suggestion from the postal code (BZSt GemFA)', () => {
  it('names the one office of a postal code that has one', () => {
    expect(suggestTaxOffices('79539')).toEqual(['Finanzamt Lörrach'])
    expect(suggestTaxOffices('66740')).toEqual(['Finanzamt Saarlouis'])
    expect(suggestTaxOffices('01067')).toEqual(['Finanzamt Dresden-Süd'])
  })

  it('names every office of a postal code that is split by street, never a guess at one', () => {
    expect(suggestTaxOffices('50667')).toEqual(['Finanzamt Köln-Altstadt', 'Finanzamt Köln-Mitte'])
    expect(suggestTaxOffices('10115')).toEqual(['Finanzamt Mitte/Tiergarten', 'Finanzamt Wedding'])
  })

  it('stays quiet for an unknown, incomplete or malformed postal code', () => {
    expect(suggestTaxOffices('00000')).toEqual([])
    expect(suggestTaxOffices('5066')).toEqual([])
    expect(suggestTaxOffices('abcde')).toEqual([])
    expect(suggestTaxOffices('')).toEqual([])
  })

  it('ships a well-formed table: five-digit postal codes, one to four known offices each', () => {
    const names = TAX_OFFICE_NAMES.split('|')
    const lines = TAX_OFFICE_TABLE.split('\n')
    expect(lines.length).toBeGreaterThan(8000)
    expect(names.length).toBeGreaterThan(400)
    for (const line of lines) {
      expect(line).toMatch(/^\d{5}=[0-9a-z]+(,[0-9a-z]+){0,3}$/)
      for (const code of line.slice(6).split(',')) expect(names[parseInt(code, 36)]).toBeTruthy()
    }
    expect(TAX_OFFICE_SOURCE.stand).toMatch(/^\d{2}\.\d{2}\.\d{4}$/)
  })
})
