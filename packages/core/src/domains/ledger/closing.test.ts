import { describe, expect, it } from 'vitest'
import { euerProfit } from '../business/profit'
import { accountFor, type AccountConceptId, type BookingTaxKey, type ChartOfAccounts } from './accounts'
import { accountsOfPosition, balanceSheet, closingBalances, ClosingError, euerTotals, incomeStatement, kontennachweise, openingEntryDraft, trialBalance } from './closing'
import { createLedger, postEntry, reverseEntry, type Ledger, type RegularPayment, type Side } from './journal'

// ADR-0101 §15 — closing a year. Two golden years, each booked in SKR03 and SKR04: the same business
// events must give the same EÜR, GuV and Bilanz in either chart.

type Line = readonly [AccountConceptId, Side, number, BookingTaxKey?]

function book(ledger: Ledger, date: string, doc: string, text: string, lines: readonly Line[], regularPayment?: RegularPayment): Ledger {
  return postEntry(ledger, {
    date,
    documentNumber: doc,
    text,
    lines: lines.map(([concept, side, amount, taxKey]) => ({ account: accountFor(ledger.chart, concept).number, side, amount, ...(taxKey === undefined ? {} : { taxKey }) })),
    ...(regularPayment === undefined ? {} : { regularPayment }),
  }).ledger
}

const CHARTS: readonly ChartOfAccounts[] = ['SKR03', 'SKR04']

// ---------------------------------------------------------------------------------------------------
// Golden year 1: a freelancer with EÜR (cash basis), Regelbesteuerung, 2025.

function euerYear(chart: ChartOfAccounts): Ledger {
  let l = createLedger(chart, 'euer')
  l = book(l, '2025-01-15', 'AR-1', 'Honorar Januar', [['bank', 'debit', 595_000], ['revenue_19', 'credit', 595_000, 'ust19']])
  l = book(l, '2025-02-03', 'AR-2', 'Lizenz Fachbuch', [['bank', 'debit', 107_000], ['revenue_7', 'credit', 107_000, 'ust7']])
  l = book(l, '2025-03-01', 'ER-1', 'Büromiete März', [['rent', 'debit', 119_000, 'vst19'], ['bank', 'credit', 119_000]])
  l = book(l, '2025-04-10', 'ER-2', 'Notebook', [['business_equipment_other', 'debit', 142_800, 'vst19'], ['bank', 'credit', 142_800]])
  l = book(l, '2025-05-05', 'ER-3', 'Mobilfunk', [['phone', 'debit', 5_950, 'vst19'], ['bank', 'credit', 5_950]])
  l = book(l, '2025-06-01', 'ER-4', 'Cloud-Dienst aus Irland', [['services_eu_13b_19', 'debit', 20_000, 'rc13b19'], ['bank', 'credit', 20_000]])
  l = book(l, '2025-07-10', 'ER-5', 'Bewirtung Kunde', [['entertainment', 'debit', 11_900, 'vst19'], ['bank', 'credit', 11_900]])
  l = book(l, '2025-08-15', 'FA-1', 'USt-Vorauszahlung', [['vat_prepayments', 'debit', 50_000], ['bank', 'credit', 50_000]])
  l = book(l, '2025-09-01', 'P-1', 'Privatentnahme', [['private_withdrawals', 'debit', 200_000], ['bank', 'credit', 200_000]])
  l = book(l, '2025-10-01', 'U-1', 'Private Kfz-Nutzung', [['private_withdrawals', 'debit', 35_700], ['private_car_use_19', 'credit', 35_700, 'ust19']])
  l = book(l, '2025-11-20', 'FA-2', 'Erstattung USt 2024', [['bank', 'debit', 12_000], ['vat_prior_year', 'credit', 12_000]])
  l = book(l, '2025-12-28', 'ER-6', 'Büromiete Januar 2026', [['rent', 'debit', 119_000, 'vst19'], ['bank', 'credit', 119_000]], { dueDate: '2026-01-01', periodYear: 2026 })
  l = book(l, '2025-12-31', 'AfA-1', 'AfA Notebook', [['depr_tangible', 'debit', 30_000], ['business_equipment_other', 'credit', 30_000]])
  l = book(l, '2026-01-08', 'FA-3', 'USt-Vorauszahlung Dezember', [['vat_prepayments', 'debit', 30_000], ['bank', 'credit', 30_000]], { dueDate: '2026-01-10', periodYear: 2025 })
  return l
}

describe('golden EÜR 2025 (cash basis)', () => {
  it.each(CHARTS)('%s: totals per EÜR key', (chart) => {
    const result = euerTotals(euerYear(chart), 2025)
    expect(result.byKey).toEqual({
      einnahmen_umsatzsteuerpflichtig: 600_000, // 5.000,00 + 1.000,00 net
      einnahmen_umsatzsteuer_vereinnahmt: 102_000, // 950,00 + 70,00
      einnahmen_umsatzsteuer_entnahmen: 5_700, // 19 % on the private car use of 300,00
      einnahmen_private_kfz_nutzung: 30_000,
      einnahmen_vorsteuer_erstattet: 12_000,
      ausgaben_raumkosten: 100_000, // only March; the January 2026 rent paid 28.12. counts in 2026
      ausgaben_vorsteuer_gezahlt: 44_650, // 190,00 + 228,00 + 9,50 + 19,00; § 13b VAT nets to zero
      ausgaben_afa_beweglich: 30_000,
      ausgaben_telekommunikation: 5_000,
      ausgaben_fremdleistungen: 20_000,
      beschraenkt_bewirtung: 10_000,
      ausgaben_umsatzsteuer_an_finanzamt: 80_000, // 500,00 in August + 300,00 paid 8.1.2026 for December
    })
    // Einnahmen 6.000 + 1.077 + 300 + 120 = 7.497,00; Ausgaben 1.000 + 446,50 + 300 + 50 + 200 + 100 + 800 = 2.896,50
    expect(result.einnahmen).toBe(749_700)
    expect(result.ausgaben).toBe(289_650)
    expect(result.ueberschuss).toBe(460_050)
    expect(result.nonDeductible).toEqual({})
  })

  it('counts the early January rent in 2026 and marks non-deductible parts', () => {
    let l = euerYear('SKR04')
    l = book(l, '2026-02-01', 'ER-7', 'Geschenk über Freigrenze', [['gifts_nondeductible', 'debit', 6_000], ['bank', 'credit', 6_000]])
    const y2026 = euerTotals(l, 2026)
    expect(y2026.byKey.ausgaben_raumkosten).toBe(100_000)
    expect(y2026.byKey.ausgaben_umsatzsteuer_an_finanzamt).toBeUndefined()
    expect(y2026.nonDeductible).toEqual({ beschraenkt_geschenke: 6_000 })
  })

  it('lists trade tax and other non-deductible expenses on their own keys, as not deductible', () => {
    let l = createLedger('SKR03', 'euer')
    l = book(l, '2025-02-15', 'GewSt-1', 'Gewerbesteuer-Vorauszahlung', [['trade_tax', 'debit', 120_000], ['bank', 'credit', 120_000]])
    l = book(l, '2025-03-15', 'FA-9', 'Verspätungszuschlag', [['late_fees_nondeductible', 'debit', 5_000], ['bank', 'credit', 5_000]])
    l = book(l, '2025-12-31', 'H-1', 'Überentnahme § 4 Abs. 4a', [['interest_nondeductible_4_4a', 'debit', 7_000], ['bank', 'credit', 7_000]])
    const result = euerTotals(l, 2025)
    expect(result.byKey).toEqual({ ausgaben_gewerbesteuer: 120_000, nicht_abziehbar_sonstige: 5_000, nicht_abziehbar_schuldzinsen_4_4a: 7_000 })
    expect(result.nonDeductible).toEqual(result.byKey)
  })

  it('hands profit.ts totals it reads as intended: non-deductible amounts on their own key only', () => {
    let l = euerYear('SKR03')
    l = book(l, '2025-02-15', 'GewSt-1', 'Gewerbesteuer', [['trade_tax', 'debit', 120_000], ['bank', 'credit', 120_000]])
    l = book(l, '2025-03-15', 'FA-9', 'Zwangsgeld', [['late_fees_nondeductible', 'debit', 5_000], ['bank', 'credit', 5_000]])
    l = book(l, '2025-06-30', 'Z-1', 'Darlehenszinsen', [['interest_long', 'debit', 30_000], ['bank', 'credit', 30_000]])
    l = book(l, '2025-12-31', 'H-1', 'Davon nicht abziehbar § 4 Abs. 4a', [['interest_nondeductible_4_4a', 'debit', 7_000], ['interest_long', 'credit', 7_000]])
    const totals = euerTotals(l, 2025)
    expect(totals.byKey.ausgaben_schuldzinsen).toBe(23_000) // 300,00 − 70,00 moved to its own key
    const euros = Object.fromEntries(Object.entries(totals.byKey).map(([k, v]) => [k, v / 100]))
    const profit = euerProfit(2025, euros)
    // 4.600,50 from the golden year − 230,00 deductible interest + 30,00 (only 70 % of the 100,00 Bewirtung
    // count); Gewerbesteuer 1.200, Zwangsgeld 50 and § 4 Abs. 4a interest 70 count 0.
    expect(profit.profitEur).toBe(4_600.5 - 230 + 30)
    expect((totals.ueberschuss + 120_000 + 5_000 + 7_000) / 100 + 30).toBe(profit.profitEur)
  })

  it('keeps VAT on withdrawals on its own key, also through a Storno', () => {
    let l = createLedger('SKR04', 'euer')
    l = book(l, '2025-06-30', 'U-1', 'Warenentnahme', [['private_withdrawals', 'debit', 10_700], ['withdrawal_goods_7', 'credit', 10_700, 'ust7']])
    l = book(l, '2025-07-01', 'AR-1', 'Verkauf', [['bank', 'debit', 11_900], ['revenue_19', 'credit', 11_900, 'ust19']])
    expect(euerTotals(l, 2025).byKey).toMatchObject({ einnahmen_umsatzsteuer_entnahmen: 700, einnahmen_umsatzsteuer_vereinnahmt: 1_900, einnahmen_sonstige_entnahmen: 10_000 })
    l = reverseEntry(l, 1, { date: '2025-07-02', documentNumber: 'ST-1' }).ledger
    expect(euerTotals(l, 2025).byKey).toMatchObject({ einnahmen_umsatzsteuer_entnahmen: 0, einnahmen_sonstige_entnahmen: 0 })
  })

  it('gives the same EÜR in SKR03 and SKR04', () => {
    expect(euerTotals(euerYear('SKR03'), 2025)).toEqual(euerTotals(euerYear('SKR04'), 2025))
  })

  it('is not derived from an accrual ledger', () => {
    expect(() => euerTotals(createLedger('SKR03', 'bilanz'), 2025)).toThrow(ClosingError)
    expect(() => balanceSheet(createLedger('SKR03', 'euer'), 2025)).toThrow(ClosingError)
    expect(() => closingBalances(createLedger('SKR03', 'euer'), 2025)).toThrow(ClosingError)
  })
})

// ---------------------------------------------------------------------------------------------------
// Golden year 2: a trader with a Bilanz. 2024 opens the business, 2025 starts from its Eröffnungsbilanz.

function year2024(chart: ChartOfAccounts): Ledger {
  let l = createLedger(chart, 'bilanz')
  l = book(l, '2024-01-02', '2024-1', 'Einlage', [['bank', 'debit', 1_000_000], ['private_deposits', 'credit', 1_000_000]])
  l = book(l, '2024-01-10', '2024-2', 'Darlehen', [['bank', 'debit', 1_500_000], ['loans_bank', 'credit', 1_500_000]])
  l = book(l, '2024-02-01', '2024-3', 'Pkw', [['vehicles', 'debit', 2_380_000, 'vst19'], ['bank', 'credit', 2_380_000]])
  l = book(l, '2024-11-30', '2024-4', 'Ausgangsrechnung offen', [['receivables', 'debit', 1_190_000], ['revenue_19', 'credit', 1_190_000, 'ust19']])
  l = book(l, '2024-12-15', '2024-5', 'Büromaterial auf Rechnung', [['office_supplies', 'debit', 119_000, 'vst19'], ['payables', 'credit', 119_000]])
  l = book(l, '2024-12-31', '2024-6', 'AfA Pkw', [['depr_vehicles', 'debit', 300_000], ['vehicles', 'credit', 300_000]])
  return l
}

function year2025(chart: ChartOfAccounts): Ledger {
  let l = year2024(chart)
  l = postEntry(l, openingEntryDraft(chart, closingBalances(l, 2024), 2025)).ledger
  l = book(l, '2025-01-20', '2025-1', 'Kunde zahlt', [['bank', 'debit', 1_190_000], ['receivables', 'credit', 1_190_000]])
  l = book(l, '2025-01-25', '2025-2', 'Lieferant bezahlt', [['payables', 'debit', 119_000], ['bank', 'credit', 119_000]])
  l = book(l, '2025-02-10', '2025-3', 'Erstattung USt 2024', [['bank', 'debit', 209_000], ['vat_19', 'debit', 190_000], ['input_vat_19', 'credit', 399_000]])
  l = book(l, '2025-03-31', '2025-4', 'Ausgangsrechnung', [['receivables', 'debit', 2_380_000], ['revenue_19', 'credit', 2_380_000, 'ust19']])
  l = book(l, '2025-04-30', '2025-5', 'Kunde zahlt', [['bank', 'debit', 2_380_000], ['receivables', 'credit', 2_380_000]])
  l = book(l, '2025-05-15', '2025-6', 'Miete', [['rent', 'debit', 714_000, 'vst19'], ['bank', 'credit', 714_000]])
  l = book(l, '2025-06-30', '2025-7', 'Zinsen und Tilgung', [['interest_long', 'debit', 60_000], ['loans_bank', 'debit', 300_000], ['bank', 'credit', 360_000]])
  l = book(l, '2025-07-01', '2025-8', 'Privatentnahme', [['private_withdrawals', 'debit', 800_000], ['bank', 'credit', 800_000]])
  l = book(l, '2025-12-20', '2025-9', 'Ausgangsrechnung offen', [['receivables', 'debit', 595_000], ['revenue_19', 'credit', 595_000, 'ust19']])
  l = book(l, '2025-12-30', '2025-10', 'USt-Vorauszahlungen', [['vat_prepayments', 'debit', 200_000], ['bank', 'credit', 200_000]])
  l = book(l, '2025-12-31', '2025-11', 'AfA Pkw', [['depr_vehicles', 'debit', 300_000], ['vehicles', 'credit', 300_000]])
  return l
}

describe('golden Bilanz 2024 → 2025 (accrual)', () => {
  it.each(CHARTS)('%s: Bilanz 31.12.2024', (chart) => {
    const bs = balanceSheet(year2024(chart), 2024)
    // GuV: Umsatz 10.000 − Büromaterial 1.000 − AfA 3.000 = Gewinn 6.000
    expect(bs.profit).toBe(600_000)
    expect(bs.aktiva).toEqual({
      'A.I': 0, 'A.II': 1_700_000, // Pkw 20.000 − AfA 3.000
      'A.III': 0, 'B.I': 0,
      'B.II': 1_399_000, // Forderung 11.900 + VAT receivable (Vorsteuer 3.990 − USt 1.900 = 2.090)
      'B.III': 0,
      'B.IV': 120_000, // Bank 10.000 + 15.000 − 23.800
      C: 0,
    })
    // Kapital: Einlage 10.000 + Gewinn 6.000; Verbindlichkeiten: Darlehen 15.000 + Lieferant 1.190
    expect(bs.passiva).toEqual({ 'P.A': 1_600_000, 'P.B': 0, 'P.C': 1_619_000, 'P.D': 0 })
    expect(bs.totalAktiva).toBe(3_219_000)
    expect(bs.totalPassiva).toBe(3_219_000)
    expect(bs.equity).toEqual({ opening: 0, deposits: 1_000_000, withdrawals: 0, profit: 600_000, closing: 1_600_000 })
  })

  it.each(CHARTS)('%s: Eröffnungsbilanz 2025 carries the closing balances, private and profit in the capital', (chart) => {
    const balances = closingBalances(year2024(chart), 2024)
    const n = (c: AccountConceptId): string => accountFor(chart, c).number
    expect(balances).toEqual(
      [
        { account: n('vehicles'), side: 'debit', amount: 1_700_000 },
        { account: n('receivables'), side: 'debit', amount: 1_190_000 },
        { account: n('input_vat_19'), side: 'debit', amount: 399_000 },
        { account: n('bank'), side: 'debit', amount: 120_000 },
        { account: n('vat_19'), side: 'credit', amount: 190_000 },
        { account: n('loans_bank'), side: 'credit', amount: 1_500_000 },
        { account: n('payables'), side: 'credit', amount: 119_000 },
        { account: n('variable_capital'), side: 'credit', amount: 1_600_000 },
      ].sort((a, b) => a.account.localeCompare(b.account)),
    )
    const total = (side: string): number => balances.filter((b) => b.side === side).reduce((s, b) => s + b.amount, 0)
    expect(total('debit')).toBe(total('credit')) // 34.090,00 on each side
  })

  it.each(CHARTS)('%s: GuV and Bilanz 2025', (chart) => {
    const l = year2025(chart)
    const guv = incomeStatement(l, 2025)
    // Umsatz 20.000 + 5.000; Miete 6.000, AfA 3.000, Zinsen 600 → Gewinn 15.400
    expect(guv.positions).toEqual({ 'GuV.1': 2_500_000, 'GuV.7': 300_000, 'GuV.8': 600_000, 'GuV.13': 60_000 })
    expect(guv.profit).toBe(1_540_000)
    const bs = balanceSheet(l, 2025)
    expect(bs.aktiva).toEqual({
      'A.I': 0, 'A.II': 1_400_000, // 17.000 − 3.000
      'A.III': 0, 'B.I': 0,
      'B.II': 595_000, // open invoice; VAT is a liability this year
      'B.III': 0,
      'B.IV': 1_706_000, // 1.200 + 11.900 − 1.190 + 2.090 + 23.800 − 7.140 − 3.600 − 8.000 − 2.000
      C: 0,
    })
    // Kapital 16.000 + Gewinn 15.400 − Entnahme 8.000 = 23.400
    // Verbindlichkeiten: Darlehen 12.000 + VAT (USt 4.750 − Vorsteuer 1.140 − Vorauszahlungen 2.000 = 1.610)
    expect(bs.passiva).toEqual({ 'P.A': 2_340_000, 'P.B': 0, 'P.C': 1_361_000, 'P.D': 0 })
    expect(bs.totalAktiva).toBe(3_701_000)
    expect(bs.totalPassiva).toBe(3_701_000)
    expect(bs.equity).toEqual({ opening: 1_600_000, deposits: 0, withdrawals: 800_000, profit: 1_540_000, closing: 2_340_000 })
  })

  it('gives the same Bilanz and GuV in SKR03 and SKR04', () => {
    expect(balanceSheet(year2025('SKR03'), 2025)).toEqual(balanceSheet(year2025('SKR04'), 2025))
    expect(incomeStatement(year2025('SKR03'), 2025)).toEqual(incomeStatement(year2025('SKR04'), 2025))
  })

  it('shows an overdrawn bank account as a liability', () => {
    let l = createLedger('SKR03', 'bilanz')
    l = book(l, '2025-01-02', '1', 'Material', [['material', 'debit', 50_000], ['bank', 'credit', 50_000]])
    const bs = balanceSheet(l, 2025)
    expect(bs.aktiva['B.IV']).toBe(0)
    expect(bs.passiva['P.C']).toBe(50_000)
    expect(bs.passiva['P.A']).toBe(-50_000)
  })

  it('refuses a Bilanz whose Saldenvortrag does not net to zero', () => {
    let l = createLedger('SKR04', 'bilanz')
    l = book(l, '2025-01-01', 'EB', 'falsch', [['bank', 'debit', 100], ['opening_balances', 'credit', 100]])
    expect(() => balanceSheet(l, 2025)).toThrow(ClosingError)
  })
})

describe('trialBalance', () => {
  it('lists every account of the period with equal debit and credit totals', () => {
    const tb = trialBalance(year2025('SKR03'), '2025-01-01', '2025-12-31')
    expect(tb.totalDebit).toBe(tb.totalCredit)
    expect(tb.rows.find((r) => r.account === '9000')?.balance).toBe(0)
    expect(tb.rows.map((r) => r.account)).toEqual(tb.rows.map((r) => r.account).sort())
    expect(tb.rows[0]?.label).not.toBe('')
  })
})

describe('accountsOfPosition', () => {
  it('lists the accounts behind a position', () => {
    expect(accountsOfPosition('SKR03', 'B.IV').map((a) => a.number)).toEqual(['1000', '1200', '1210', '1360'])
  })
})

describe('kontennachweise (§ 5b Abs. 1 EStG, BMF 10.6.2025)', () => {
  it.each(CHARTS)('%s: every account with a balance at year end, under its position, adding up to it', (chart) => {
    const l = year2025(chart)
    const rows = kontennachweise(l, 2025)
    const n = (c: AccountConceptId): string => accountFor(chart, c).number
    expect(rows.map((r) => [r.position, r.account, r.amount])).toEqual([
      ['A.II', n('vehicles'), 1_400_000],
      ['B.II', n('receivables'), 595_000],
      ['B.IV', n('bank'), 1_706_000],
      ['P.A', n('variable_capital'), 1_600_000],
      ['P.A', n('private_withdrawals'), -800_000],
      ...[
        ['P.C', n('loans_bank'), 1_200_000],
        // VAT accounts are listed one by one under the position their net balance lands on.
        ['P.C', n('input_vat_19'), -114_000],
        ['P.C', n('vat_19'), 475_000],
        ['P.C', n('vat_prepayments'), -200_000],
      ].sort((a, b) => String(a[1]).localeCompare(String(b[1]))),
      ['GuV.1', n('revenue_19'), 2_500_000],
      ['GuV.7', n('depr_vehicles'), 300_000],
      ['GuV.8', n('rent'), 600_000],
      ['GuV.13', n('interest_long'), 60_000],
    ])
    expect(rows.every((r) => r.label !== '' && r.element.length > 0)).toBe(true)
    const bs = balanceSheet(l, 2025)
    const guv = incomeStatement(l, 2025)
    const sumAt = (p: string): number => rows.filter((r) => r.position === p).reduce((s, r) => s + r.amount, 0)
    for (const [p, v] of Object.entries({ ...bs.aktiva, ...bs.passiva })) {
      // The capital position also holds the profit of the year, which is no account.
      expect(sumAt(p) + (p === 'P.A' ? bs.profit : 0)).toBe(v)
    }
    for (const [p, v] of Object.entries(guv.positions)) expect(sumAt(p)).toBe(v)
  })

  it('leaves out accounts without a balance, the Saldenvortrag included', () => {
    const rows = kontennachweise(year2025('SKR03'), 2025)
    expect(rows.some((r) => r.account === '9000' || r.account === accountFor('SKR03', 'payables').number)).toBe(false)
    expect(() => kontennachweise(createLedger('SKR03', 'euer'), 2025)).toThrow(ClosingError)
  })
})
