import { describe, expect, it } from 'vitest'
import { annexNGreAmounts, annualAverageRate } from '@steuereule/core'
import { EMPTY_N_GRE, type CrossBorderSalaryStatementRecord } from '../src/ch-salary-certificate/ch-salary-certificate.repository.js'
import { exchangeRateFromRecord, nGreInputFromRecord } from '../src/ch-salary-certificate/salary-certificate-data.js'

const fields = Object.fromEntries(
  [
    'lohn', 'gehaltsnebenleistungen', 'unregelmaessige-leistungen', 'kapitalleistungen', 'beteiligungsrechte', 'sitzungsgelder',
    'andere-leistungen', 'bruttolohn-total', 'ahv-beitraege', 'berufliche-vorsorge', 'nettolohn', 'quellensteuer', 'spesen',
    'weitere-nebenleistungen',
  ].map((id) => [id, null]),
) as CrossBorderSalaryStatementRecord['fields']

const RECORD: CrossBorderSalaryStatementRecord = {
  userId: 'u1',
  taxYear: 2025,
  fields: { ...fields, 'bruttolohn-total': '100000', 'ahv-beitraege': '6600', 'berufliche-vorsorge': '7186', quellensteuer: '4500' },
  bemerkungen: null,
  saeule3aChf: null,
  krankenkasseChf: null,
  exchangeRateMonth: '2025',
  exchangeRateValue: 1.065,
  exchangeRateMode: 'jahresdurchschnitt',
  exchangeRateReceiptId: null,
  nGre: {
    ...EMPTY_N_GRE,
    familienzulagenChf: '2400',
    krankentaggeldChf: '0',
    pkArbeitnehmerChf: '2892',
    pkArbeitgeberChf: '2892',
    pkArbeitgeberGesamtChf: '7186',
    steuerfreiesKrankentaggeldChf: '3853',
    nbuvArbeitgeberProzent: '100',
    nbuvArbeitgeberChf: '540',
  },
}

describe('salary certificate record → core inputs', () => {
  it('reads the Jahresdurchschnittskurs back with its mode', () => {
    expect(exchangeRateFromRecord(RECORD)).toEqual(annualAverageRate('2025', 1.065))
  })

  it('feeds Ziffer 10 as the employee total and the stored N-Gre facts to the Anlage N-Gre', () => {
    const input = nGreInputFromRecord(RECORD, annualAverageRate('2025', 1.065))
    expect(input).toMatchObject({ pkArbeitnehmerGesamtChf: 7186, pkArbeitgeberGesamtChf: 7186, steuerfreiesKrankentaggeldChf: 3853, rate: 1.065 })
    const { chf, pension } = annexNGreAmounts(input)
    // 100000 − 2400 − 3853 + 540 + (7186 − 2892) = 98581
    expect(chf).toMatchObject({ z9: 3853, z20: 4294, z23: 98581, z84: 2892, z87: 2892 })
    expect(pension.employee).toEqual({ mandatoryChf: 2892, overMandatoryChf: 4294 })
  })
})
