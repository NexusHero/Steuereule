import { readFileSync } from 'node:fs'
import { BANK_CSV_PRESETS, parseBankCsv } from '@steuereule/core'
import { describe, expect, it } from 'vitest'
import { toCoreMapping } from '../src/business/csv-mapping.js'

const SPARKASSE = readFileSync(new URL('../../../packages/core/src/domains/ledger/__fixtures__/sparkasse-csv-camt-v2.csv', import.meta.url), 'utf8')

describe('bank CSV column mapping of the app (ADR-0101 §14)', () => {
  it('columns by position read the same transactions as the preset', () => {
    const mapping = toCoreMapping(
      { delimiter: ';', decimal: ',', dateFormat: 'DD.MM.YY', bookingDate: { index: 1 }, valueDate: { index: 2 }, amount: { index: 14 }, counterpartyName: { index: 11 }, counterpartyIban: { index: 12 }, reference: [{ index: 4 }], currency: { index: 15 } },
      SPARKASSE,
    )
    const byIndex = parseBankCsv(SPARKASSE, mapping).map((t) => [t.bookingDate, t.amount, t.reference])
    const byPreset = parseBankCsv(SPARKASSE, BANK_CSV_PRESETS.sparkasse).map((t) => [t.bookingDate, t.amount, t.reference])
    expect(byIndex).toEqual(byPreset)
  })

  it('names a column the file does not have', () => {
    expect(() => toCoreMapping({ delimiter: ';', decimal: ',', dateFormat: 'DD.MM.YY', bookingDate: { index: 99 }, amount: { index: 14 }, reference: [{ index: 4 }] }, SPARKASSE)).toThrow(/Spalte 100/)
  })
})
