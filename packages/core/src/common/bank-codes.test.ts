import { describe, expect, it } from 'vitest'
import { BANK_CODE_SOURCE, BANK_CODE_TABLE } from './bank-codes.data'
import { bankNameForBlz, bankNameForIban } from './bank-codes'

describe('bank name from the IBAN (#452 decision 12, AC 8)', () => {
  it('names the bank of a German IBAN offline', () => {
    expect(bankNameForIban('DE89 3704 0044 0532 0130 00')).toMatch(/Commerzbank/)
    expect(bankNameForBlz('10010010')).toMatch(/Postbank/)
  })

  it('stays quiet for an unknown BLZ, a foreign IBAN or an incomplete one', () => {
    expect(bankNameForBlz('00000000')).toBeNull()
    expect(bankNameForIban('CH93 0076 2011 6238 5295 7')).toBeNull()
    expect(bankNameForIban('DE89 3704')).toBeNull()
  })

  it('carries its Bundesbank source and validity', () => {
    expect(BANK_CODE_SOURCE.valid).toMatch(/\d{2}\.\d{2}\.\d{4}/)
    expect(BANK_CODE_TABLE.split('\n').length).toBeGreaterThan(3000)
  })
})
