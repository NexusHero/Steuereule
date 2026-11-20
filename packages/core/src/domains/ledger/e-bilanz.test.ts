import { describe, expect, it } from 'vitest'
import { accountFor, E_BILANZ_ELEMENTS, type AccountConceptId, type BookingTaxKey } from './accounts'
import { anlagespiegel } from './assets'
import { balanceSheet, incomeStatement, kontennachweise } from './closing'
import { E_BILANZ_DETAIL_ELEMENTS, E_BILANZ_TAXONOMIES, EBilanzError, eBilanzInstance, kontennachweisRequired, taxonomyForFiscalYear, type EBilanzInput } from './e-bilanz'
import { createLedger, postEntry, type Ledger, type Side } from './journal'
import { parseXml, type XmlElement } from './xml'

// ADR-0101 §15, §17 — the E-Bilanz XBRL instance. Structure is checked here; schema and plausibility
// checks of the taxonomy only run in ERiC, which the app does not have yet.

function ledger2025(): Ledger {
  let l = createLedger('SKR04', 'bilanz')
  const book = (date: string, lines: readonly (readonly [AccountConceptId, Side, number, BookingTaxKey?])[]): void => {
    l = postEntry(l, { date, documentNumber: date, text: 'x', lines: lines.map(([c, side, amount, taxKey]) => ({ account: accountFor('SKR04', c).number, side, amount, taxKey: taxKey ?? 'none' })) }).ledger
  }
  book('2025-01-02', [['bank', 'debit', 500_000], ['private_deposits', 'credit', 500_000]])
  book('2025-02-01', [['receivables', 'debit', 238_000], ['revenue_19', 'credit', 238_000, 'ust19']])
  book('2025-03-01', [['rent', 'debit', 59_500, 'vst19'], ['bank', 'credit', 59_500]])
  book('2025-04-01', [['interest_income', 'credit', 1_000], ['bank', 'debit', 1_000]])
  book('2025-05-02', [['business_equipment_other', 'debit', 119_000, 'vst19'], ['bank', 'credit', 119_000]])
  book('2025-12-31', [['depr_tangible', 'debit', 20_000], ['business_equipment_other', 'credit', 20_000]])
  return l
}

const notebook = { id: 'nb', label: 'Notebook', account: '0690', acquisitionDate: '2025-05-02', acquisitionCost: 100_000, depreciationByYear: { 2025: 20_000 } }

function input(overrides: Partial<EBilanzInput> = {}): EBilanzInput {
  const l = ledger2025()
  return {
    company: { name: 'Beispiel Handel e. K.', steuernummer: '5133081508159', street: 'Musterweg', houseNumber: '1', zipCode: '50667', city: 'Köln' },
    fiscalYearBegin: '2025-01-01',
    fiscalYearEnd: '2025-12-31',
    balanceSheet: balanceSheet(l, 2025),
    incomeStatement: incomeStatement(l, 2025),
    statementType: 'steuerbilanz',
    kontennachweise: kontennachweise(l, 2025),
    anlagespiegel: anlagespiegel('SKR04', [notebook], 2025),
    ...overrides,
  }
}

const facts = (root: XmlElement, prefix: string): Map<string, XmlElement> =>
  new Map(root.children.filter((c) => c.qname.startsWith(prefix)).map((c) => [c.qname.slice(prefix.length), c]))

describe('taxonomyForFiscalYear', () => {
  it('picks the mandatory version per Wirtschaftsjahr 2022 to 2026', () => {
    expect(['2022-01-01', '2023-01-01', '2024-01-01', '2025-01-01', '2026-01-01'].map((d) => taxonomyForFiscalYear(d).version)).toEqual(['6.5', '6.6', '6.7', '6.8', '6.9'])
    // A Wirtschaftsjahr 2024/2025 beginning 1.7.2024 follows the year it begins in.
    expect(taxonomyForFiscalYear('2024-07-01').version).toBe('6.7')
    expect(() => taxonomyForFiscalYear('2021-01-01')).toThrow(EBilanzError)
    expect(() => taxonomyForFiscalYear('2027-01-01')).toThrow(EBilanzError)
    expect(E_BILANZ_TAXONOMIES.map((t) => t.date)).toEqual(['2021-04-01', '2022-04-01', '2023-04-01', '2024-04-01', '2025-04-01', '2026-04-01'])
  })
})

describe('eBilanzInstance', () => {
  const root = parseXml(eBilanzInstance(input()))
  const gaap = facts(root, 'de-gaap-ci:')
  const gcd = facts(root, 'de-gcd:')
  const value = (element: string): number => Math.round(Number(gaap.get(element)!.text) * 100)

  it('references the taxonomy of the year and declares contexts and unit', () => {
    expect(root.qname).toBe('xbrli:xbrl')
    // WJ 2025 must carry Kontennachweise, which only 6.9 can hold; 6.9 may be used for 2025 already.
    expect(root.attrs['xmlns:de-gaap-ci']).toBe('http://www.xbrl.de/taxonomies/de-gaap-ci-2025-04-01')
    const refs = root.children.filter((c) => c.qname === 'link:schemaRef').map((c) => c.attrs['xlink:href'])
    expect(refs).toEqual([
      'http://www.xbrl.de/taxonomies/de-gcd-2025-04-01/de-gcd-2025-04-01-shell.xsd',
      'http://www.xbrl.de/taxonomies/de-gaap-ci-2025-04-01/de-gaap-ci-2025-04-01-shell-fiscal.xsd',
    ])
    const contexts = root.children.filter((c) => c.qname === 'xbrli:context').map((c) => c.attrs.id)
    expect(contexts).toEqual(['D-2025', 'I-2025', 'I-2024', 'D-2025-AV1'])
    for (const fact of [...gaap.values(), ...gcd.values()]) if (fact.children.length === 0) expect(contexts).toContain(fact.attrs.contextRef)
    for (const fact of gaap.values()) if (fact.children.length === 0) expect(fact.attrs).toMatchObject({ unitRef: 'EUR', decimals: '2' })
  })

  it('carries the Stammdaten of an Einzelunternehmen', () => {
    expect(gcd.get('genInfo.company.id.name')?.text).toBe('Beispiel Handel e. K.')
    expect(gcd.get('genInfo.company.id.idNo.type.companyId.ST13')?.text).toBe('5133081508159')
    expect(gcd.has('genInfo.company.id.legalStatus.legalStatus.EU')).toBe(true)
    expect(gcd.has('genInfo.report.id.statementType.tax.tax.S')).toBe(true)
    expect(gcd.get('genInfo.report.period.fiscalYearEnd')?.text).toBe('2025-12-31')
    expect(gcd.get('genInfo.company.id.location.city')?.text).toBe('Köln')
  })

  it('has every Bilanz and GuV position, with totals that add up', () => {
    const aktiva = (['A.I', 'A.II', 'A.III', 'B.I', 'B.II', 'B.III', 'B.IV', 'C'] as const).map((p) => value(E_BILANZ_ELEMENTS[p]))
    const passiva = (['P.A', 'P.B', 'P.C', 'P.D'] as const).map((p) => value(E_BILANZ_ELEMENTS[p]))
    expect(aktiva.reduce((s, v) => s + v, 0)).toBe(value('bs.ass'))
    expect(passiva.reduce((s, v) => s + v, 0)).toBe(value('bs.eqLiab'))
    // Bank 5.000 − 595 + 10 − 1.190 = 3.225; notebook 1.000 − 200 = 800; receivable 2.380;
    // VAT: 380 owed − 95 − 190 input = 95 liability
    expect(value('bs.ass')).toBe(640_500)
    expect(value('bs.eqLiab')).toBe(640_500)
    // Umsatz 2.000 − Miete 500 − AfA 200 + Zinsen 10 = 1.310
    expect(value('is.netIncome')).toBe(131_000)
    expect(value(E_BILANZ_ELEMENTS['GuV.8'])).toBe(50_000)
    expect(value(E_BILANZ_ELEMENTS['GuV.11'])).toBe(1_000)
  })

  it('refuses a data set that does not add up or lacks a valid Steuernummer', () => {
    const base = input()
    expect(() => eBilanzInstance({ ...base, balanceSheet: { ...base.balanceSheet, totalAktiva: 1 } })).toThrow(/Aktiva/)
    expect(() => eBilanzInstance({ ...base, incomeStatement: { ...base.incomeStatement, profit: 1 } })).toThrow(/Gewinn/)
    expect(() => eBilanzInstance({ ...base, company: { name: 'X', steuernummer: '123/456/78901' } })).toThrow(/Steuernummer/)
  })

  it('writes a Handelsbilanz and escapes names', () => {
    const xml = eBilanzInstance(input({ statementType: 'handelsbilanz', company: { name: 'A & B <e. K.>', steuernummer: '5133081508159' }, taxonomy: E_BILANZ_TAXONOMIES[4]! }))
    expect(xml).toContain('genInfo.report.id.statementType.tax.tax.GAAP')
    expect(xml).toContain('A &amp; B &lt;e. K.&gt;')
    expect(xml).toContain('de-gaap-ci-2025-04-01')
  })

  it('carries one Kontennachweis per account with a balance, with position, number, label and balance', () => {
    const tuples = root.children.filter((c) => c.qname === E_BILANZ_DETAIL_ELEMENTS.accountTuple)
    const rows = kontennachweise(ledger2025(), 2025)
    expect(tuples).toHaveLength(rows.length)
    const read = (t: XmlElement, q: string): string => t.children.find((c) => c.qname === q)!.text
    const bank = tuples.find((t) => read(t, E_BILANZ_DETAIL_ELEMENTS.accountNumber) === '1800')!
    expect(read(bank, E_BILANZ_DETAIL_ELEMENTS.accountPosition)).toBe('bs.ass.currAss.cashEquiv')
    expect(read(bank, E_BILANZ_DETAIL_ELEMENTS.accountLabel)).toBe('Geschäftskonto')
    expect(read(bank, E_BILANZ_DETAIL_ELEMENTS.accountBalance)).toBe('3225.00')
  })

  it('carries the Anlagenspiegel dimensionally: a primary item per column, the position as member of dim_changes.nt.ass.gross', () => {
    const tan = 'de-gaap-ci:bs.ass.fixAss.tan'
    const context = root.children.find((c) => c.name === 'context' && JSON.stringify(c).includes(tan))!
    expect(JSON.stringify(context)).toContain(E_BILANZ_DETAIL_ELEMENTS.assetDimension)
    const fact = root.children.find((c) => c.qname === E_BILANZ_DETAIL_ELEMENTS.assetColumns.bookValueClosing && c.attrs.contextRef === context.attrs.id)!
    expect(fact.text).toBe('800.00')
    expect(root.children.some((c) => c.qname === 'de-gaap-ci:gross.addition' && c.attrs.contextRef === context.attrs.id)).toBe(true)
    // No more invented names like bs.ass.fixAss.tan.gross.addition.
    expect(root.children.some((c) => c.qname.startsWith(`${tan}.`))).toBe(false)
  })
})

describe('Kontennachweise and Anlagenspiegel requirements', () => {
  it('requires Kontennachweise for Wirtschaftsjahre beginning after 31.12.2024 (§ 52 Abs. 11 S. 3 EStG)', () => {
    expect(kontennachweisRequired('2024-12-31')).toBe(false)
    expect(kontennachweisRequired('2025-01-01')).toBe(true)
  })

  it('needs them, or for 6.9 an explanation why they go another way (BMF 10.6.2025)', () => {
    const base = input()
    const { kontennachweise: _, ...without } = base
    expect(() => eBilanzInstance(without)).toThrow(/Kontennachweise/)
    const explained = eBilanzInstance({ ...without, kontennachweisExplanation: 'Umstellung der Software' })
    // The taxonomy has no element for the explanation: the instance builds, the text goes another way.
    expect(explained).not.toContain('Umstellung der Software')
    expect(explained).not.toContain(E_BILANZ_DETAIL_ELEMENTS.accountTuple)
    expect(() => eBilanzInstance({ ...base, taxonomy: E_BILANZ_TAXONOMIES[3]! })).toThrow(/6\.9/)
  })

  it('writes a year before 2025 without Kontennachweise in its own taxonomy', () => {
    const base = input()
    const { kontennachweise: _, ...without } = base
    const xml = eBilanzInstance({ ...without, fiscalYearBegin: '2024-01-01', fiscalYearEnd: '2024-12-31' })
    expect(xml).toContain('de-gaap-ci-2023-04-01')
    expect(xml).not.toContain(E_BILANZ_DETAIL_ELEMENTS.accountTuple)
  })

  it('refuses Kontennachweise or an Anlagenspiegel that do not match the Bilanz', () => {
    const base = input()
    const rows = base.kontennachweise!
    expect(() => eBilanzInstance({ ...base, kontennachweise: rows.slice(1) })).toThrow(/Kontennachweis/)
    expect(() => eBilanzInstance({ ...base, anlagespiegel: anlagespiegel('SKR04', [], 2025) })).toThrow(/Anlagenspiegel/)
  })
})
