import { describe, expect, it } from 'vitest'
import { churchKennzahl, federalStateOfAgs, minijobCharges, minijobLimitEur, payrollEntryLines, wageTaxFilingPeriod, wageTaxReturn } from './payroll'

describe('Minijob (gewerblich): limits and employer charges', () => {
  it('knows the monthly limit per year, 2022 with the change on 1 October', () => {
    expect(minijobLimitEur(2022, 9)).toBe(450)
    expect(minijobLimitEur(2022, 10)).toBe(520)
    expect([2023, 2024, 2025, 2026].map((y) => minijobLimitEur(y, 1))).toEqual([520, 538, 556, 603])
  })

  it('2026: 13 % KV, 15 % RV, 2 % Pauschsteuer, U1 0,8 %, U2 0,22 %, Insolvenzgeld 0,15 %; the Minijobber pays 3,6 % RV', () => {
    const r = minijobCharges({ year: 2026, month: 3, grossEur: 600, statutoryHealthInsured: true, rvExempt: false })
    expect(r).toEqual({
      overLimit: false,
      employer: { kvEur: 78, rvEur: 90, taxEur: 12, u1Eur: 4.8, u2Eur: 1.32, insolvencyEur: 0.9 },
      employerTotalEur: 187.02,
      employeeRvEur: 21.6,
      netPayEur: 578.4,
    })
  })

  it('measures the Minijobber’s RV share on at least 175 € (§ 163 Abs. 8 SGB VI)', () => {
    // 100 €: 18,6 % of 175 € = 32,55 € less the employer's 15 € = 17,55 €.
    expect(minijobCharges({ year: 2025, month: 1, grossEur: 100, statutoryHealthInsured: true, rvExempt: false }).employeeRvEur).toBe(17.55)
  })

  it('no U1 for an employer with more than 30 employees (§ 1 Abs. 1 AAG)', () => {
    expect(minijobCharges({ year: 2026, month: 3, grossEur: 600, statutoryHealthInsured: true, rvExempt: false, u1Applies: false }).employer.u1Eur).toBe(0)
  })

  it('no KV for a privately insured Minijobber, no own RV share when exempt; above the limit it is no Minijob', () => {
    const r = minijobCharges({ year: 2025, month: 6, grossEur: 500, statutoryHealthInsured: false, rvExempt: true })
    expect(r.employer.kvEur).toBe(0)
    expect(r.employeeRvEur).toBe(0)
    expect(r.netPayEur).toBe(500)
    expect(minijobCharges({ year: 2025, month: 6, grossEur: 557, statutoryHealthInsured: true, rvExempt: false }).overLimit).toBe(true)
  })
})

describe('Lohnsteuer-Anmeldung (§ 41a EStG)', () => {
  it('monthly above 5.000 € of last year’s wage tax, quarterly above 1.080 €, else yearly; a part year annualised', () => {
    expect(wageTaxFilingPeriod({ priorYearWageTaxEur: 5_001 })).toBe('monat')
    expect(wageTaxFilingPeriod({ priorYearWageTaxEur: 5_000 })).toBe('quartal')
    expect(wageTaxFilingPeriod({ priorYearWageTaxEur: 1_080 })).toBe('jahr')
    expect(wageTaxFilingPeriod({ priorYearWageTaxEur: 1_000, priorYearMonthsActive: 2 })).toBe('monat')
  })

  it('a Betriebsstätte opened this year takes its first full month × 12 (§ 41a Abs. 2 Satz 4, statute read)', () => {
    expect(wageTaxFilingPeriod({ priorYearWageTaxEur: 0, newEstablishment: { firstFullMonthWageTaxEur: 420 } })).toBe('monat')
    expect(wageTaxFilingPeriod({ priorYearWageTaxEur: 0, newEstablishment: { firstFullMonthWageTaxEur: 90 } })).toBe('jahr')
  })

  it('fills the pauschale Lohnsteuer (41, 44), Verbleiben (48) and the pauschale Kirchensteuer (47), Vordruck 2026', () => {
    const r = wageTaxReturn([{ kind: 'regulaer', employee: 'A', wageTaxEur: 300, soliEur: 0, churchTaxEur: 0, church: null, flatWageTaxEur: 50, flat37bTaxEur: 20, flatChurchTaxEur: 3.5 }])
    expect(r).toEqual({ '86': 1, '42': 300, '41': 50, '44': 20, '48': 370, '47': 3.5, '83': 373.5 })
  })

  it('puts the church tax of other communities on the line of the Betriebsstätte’s Land; one without a line counts in 83 only', () => {
    expect(federalStateOfAgs('08111000')).toBe('BW')
    expect(churchKennzahl('BW', 'iw')).toBe('73')
    expect(churchKennzahl('HE', 'fs')).toBe('66')
    expect(churchKennzahl('NI', 'iw')).toBeNull()
    expect(churchKennzahl(null, 'ev')).toBe('61')
    const r = wageTaxReturn([{ kind: 'regulaer', employee: 'A', wageTaxEur: 100, soliEur: 0, churchTaxEur: 8, church: 'ib' }], 'BW')
    expect(r).toEqual({ '86': 1, '42': 100, '78': 8, '83': 108 })
    expect(wageTaxReturn([{ kind: 'regulaer', employee: 'A', wageTaxEur: 100, soliEur: 0, churchTaxEur: 8, church: 'ib' }], 'NI')).toEqual({ '86': 1, '42': 100, '83': 108 })
  })

  it('sums the runs of a period into the Kennzahlen (42, 49, 61/62, 83, 86); a Minijob counts in Kz 86 only (Hinweis Nr. 11)', () => {
    const r = wageTaxReturn([
      { kind: 'regulaer', employee: 'A', wageTaxEur: 300, soliEur: 0, churchTaxEur: 24, church: 'ev' },
      { kind: 'regulaer', employee: 'B', wageTaxEur: 500, soliEur: 10, churchTaxEur: 40, church: 'rk' },
      { kind: 'minijob', employee: 'C', wageTaxEur: 0, soliEur: 0, churchTaxEur: 0, church: null },
    ])
    expect(r).toEqual({ '86': 3, '42': 800, '49': 10, '61': 24, '62': 40, '83': 874 })
  })
})

describe('the entry of a payroll run', () => {
  it('books gross and employer charges as expense, pays the net, owes wage tax and social security', () => {
    expect(
      payrollEntryLines({ kind: 'regulaer', grossEur: 3_000, wageTaxEur: 300, soliEur: 0, churchTaxEur: 24, employeeSocialEur: 600, employerSocialEur: 620 }),
    ).toEqual({ ok: true, netEur: 2_076, lines: { wagesEur: 3_000, employerSocialEur: 620, employerFlatTaxEur: 0, netEur: 2_076, taxesEur: 324, socialPayableEur: 1_220 } })
  })

  it('books the pauschale Lohnsteuer as the employer’s expense, owed beside the withheld taxes', () => {
    const r = payrollEntryLines({ kind: 'regulaer', grossEur: 500, wageTaxEur: 0, soliEur: 0, churchTaxEur: 0, employeeSocialEur: 0, employerSocialEur: 0, employerFlatTaxEur: 125 })
    expect(r).toMatchObject({ ok: true, netEur: 500, lines: { employerFlatTaxEur: 125, taxesEur: 125 } })
  })

  it('refuses a run whose deductions exceed the gross', () => {
    expect(payrollEntryLines({ kind: 'regulaer', grossEur: 100, wageTaxEur: 300, soliEur: 0, churchTaxEur: 0, employeeSocialEur: 0, employerSocialEur: 0 })).toMatchObject({ ok: false })
  })
})
