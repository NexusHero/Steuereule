import { describe, expect, it } from 'vitest'
import { EUER_KEYS } from '../business/euer-keys'
import { accountFor, chartAccounts, findAccount, translateAccount, type ChartOfAccounts } from './accounts'
import { SKR03_NUMBERS, SKR04_NUMBERS } from './accounts-numbers'

// ADR-0101 §12 — SKR03 and SKR04 from one list of concepts, so both charts mean the same.

const CHARTS: readonly ChartOfAccounts[] = ['SKR03', 'SKR04']

describe('charts of accounts', () => {
  it('cover the same concepts with unique four-digit numbers', () => {
    expect(Object.keys(SKR04_NUMBERS).sort()).toEqual(Object.keys(SKR03_NUMBERS).sort())
    for (const chart of CHARTS) {
      const numbers = chartAccounts(chart).map((a) => a.number)
      expect(new Set(numbers).size).toBe(numbers.length)
      for (const n of numbers) expect(n).toMatch(/^\d{4}$/)
      expect(numbers.length).toBeGreaterThan(150)
    }
  })

  it.each(CHARTS)('%s: every account is described completely and consistently', (chart) => {
    for (const a of chartAccounts(chart)) {
      expect(a.label.trim()).not.toBe('')
      if (a.euer !== null) expect(EUER_KEYS).toContain(a.euer)
      if (a.kind === 'revenue' || a.kind === 'expense') expect(a.hgb).toMatch(/^GuV\./)
      else if (a.kind === 'opening') expect(a.hgb).toBeNull()
      else expect(a.hgb).toMatch(/^(A|B|C|P)/)
      if (a.hgb !== null) expect(a.eBilanz).toMatch(/^(bs|is)\./)
      if (a.depreciationConcept !== null) expect(accountFor(chart, a.depreciationConcept).kind).toBe('expense')
      if (a.kind === 'private') expect(a.euer).toBeNull()
    }
  })

  it('places the well-known accounts on their standard numbers', () => {
    const pairs: readonly [Parameters<typeof accountFor>[1], string, string][] = [
      ['bank', '1200', '1800'], ['cash', '1000', '1600'], ['revenue_19', '8400', '4400'], ['revenue_7', '8300', '4300'],
      ['vat_19', '1776', '3806'], ['input_vat_19', '1576', '1406'], ['private_withdrawals', '1800', '2100'],
      ['private_deposits', '1890', '2180'], ['rent', '4210', '6310'], ['depr_gwg', '4855', '6260'], ['opening_balances', '9000', '9000'],
    ]
    for (const [concept, skr03, skr04] of pairs) {
      expect(accountFor('SKR03', concept).number).toBe(skr03)
      expect(accountFor('SKR04', concept).number).toBe(skr04)
    }
  })

  it('translates an account between the charts and knows unknown numbers', () => {
    expect(translateAccount('SKR03', '8400', 'SKR04')).toBe('4400')
    expect(translateAccount('SKR04', '6805', 'SKR03')).toBe('4920')
    expect(translateAccount('SKR03', '9999', 'SKR04')).toBeNull()
    expect(findAccount('SKR04', '8400')).toBeNull()
  })

  it('keeps reverse-charge VAT out of the EÜR: it arises and is deducted at once', () => {
    for (const concept of ['vat_13b_19', 'input_vat_13b_19', 'vat_ig_19', 'input_vat_ig_19'] as const) {
      expect(accountFor('SKR03', concept).euer).toBeNull()
    }
    expect(accountFor('SKR04', 'vat_prepayments').euerCredit).toBe('einnahmen_vorsteuer_erstattet')
  })

  it('maps the restricted and special expenses to their own EÜR keys', () => {
    const key = (c: Parameters<typeof accountFor>[1]): string | null => accountFor('SKR03', c).euer
    expect(key('depr_intangible')).toBe('ausgaben_afa_immateriell')
    expect(key('equipment_rental')).toBe('ausgaben_miete_leasing_beweglich')
    expect(key('leasing_equipment')).toBe('ausgaben_miete_leasing_beweglich')
    expect(key('trade_tax')).toBe('ausgaben_gewerbesteuer')
    expect(key('interest_nondeductible_4_4a')).toBe('nicht_abziehbar_schuldzinsen_4_4a')
    expect(key('late_fees_nondeductible')).toBe('nicht_abziehbar_sonstige')
    expect(key('tax_ancillary_nondeductible')).toBe('nicht_abziehbar_sonstige')
    expect(key('representation_nondeductible')).toBe('nicht_abziehbar_sonstige')
    expect(key('reduction_7g')).toBe('ausgaben_herabsetzung_7g')
    expect(key('reduction_7g_vehicles')).toBe('ausgaben_herabsetzung_7g')
    for (const c of ['trade_tax', 'interest_nondeductible_4_4a', 'late_fees_nondeductible', 'tax_ancillary_nondeductible', 'representation_nondeductible'] as const) {
      expect(accountFor('SKR04', c).nonDeductible).toBe(true)
    }
    // VAT on unentgeltliche Wertabgaben has its own EÜR line.
    for (const c of ['withdrawal_goods_19', 'withdrawal_goods_7', 'private_car_use_19', 'withdrawal_services_19'] as const) {
      expect(accountFor('SKR03', c).vatEuer).toBe('einnahmen_umsatzsteuer_entnahmen')
    }
    expect(accountFor('SKR03', 'revenue_19').vatEuer).toBeNull()
  })

  it('never puts a non-deductible account on an ordinary expense key', () => {
    for (const a of chartAccounts('SKR03').filter((x) => x.nonDeductible)) {
      expect(a.euer === 'ausgaben_gewerbesteuer' || a.euer?.startsWith('nicht_abziehbar_') || a.euer?.startsWith('beschraenkt_'), a.concept).toBe(true)
    }
  })

  it('places the new accounts on their standard numbers', () => {
    const pairs: readonly [Parameters<typeof accountFor>[1], string, string][] = [
      ['interest_nondeductible_4_4a', '2113', '7313'], ['late_fees_nondeductible', '4397', '6437'],
      ['tax_ancillary_nondeductible', '2102', '7302'], ['representation_nondeductible', '4655', '6645'],
      ['reduction_7g', '4853', '6243'], ['reduction_7g_vehicles', '4854', '6244'],
    ]
    for (const [concept, skr03, skr04] of pairs) {
      expect(accountFor('SKR03', concept).number).toBe(skr03)
      expect(accountFor('SKR04', concept).number).toBe(skr04)
    }
  })
})
