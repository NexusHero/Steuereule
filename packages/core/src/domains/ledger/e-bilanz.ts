import { E_BILANZ_ELEMENTS, type BalanceSheetPosition, type IncomeStatementPosition } from './accounts'
import type { AnlagespiegelColumns, AnlagespiegelRow } from './assets'
import type { BalanceSheet, IncomeStatement, PositionedBalance } from './closing'
import type { IsoDate } from './journal'

/**
 * The E-Bilanz data set (§ 5b EStG) as an XBRL instance: the GCD module (Stammdaten) and the GAAP
 * module (Bilanz, GuV) of the HGB taxonomy that applies to the Wirtschaftsjahr. It is not transmitted
 * yet (ADR-0101 §17): that needs ERiC and an ELSTER certificate, and only ERiC can validate it fully.
 */

export interface TaxonomyVersion {
  readonly version: string
  /** Date in the namespace and file names of the taxonomy (`de-gaap-ci-YYYY-MM-DD`). */
  readonly date: string
  /** Mandatory for Wirtschaftsjahre beginning after this day; the year before it is allowed too. */
  readonly mandatoryForYearsBeginningAfter: IsoDate
  /** The BMF letter publishing it, where we found its date. */
  readonly bmfLetter: string | null
}

/**
 * Taxonomy per Wirtschaftsjahr. 6.7 to 6.9 are confirmed by their BMF letters; 6.5 and 6.6 follow the
 * same yearly rhythm (published 1 April, mandatory from the next Wirtschaftsjahr).
 */
export const E_BILANZ_TAXONOMIES: readonly TaxonomyVersion[] = [
  { version: '6.5', date: '2021-04-01', mandatoryForYearsBeginningAfter: '2021-12-31', bmfLetter: null },
  { version: '6.6', date: '2022-04-01', mandatoryForYearsBeginningAfter: '2022-12-31', bmfLetter: null },
  { version: '6.7', date: '2023-04-01', mandatoryForYearsBeginningAfter: '2023-12-31', bmfLetter: 'BMF-Schreiben vom 9.6.2023, IV C 6 - S 2133-b/22/10002 :002' },
  { version: '6.8', date: '2024-04-01', mandatoryForYearsBeginningAfter: '2024-12-31', bmfLetter: 'BMF-Schreiben vom Juni 2024 (Veröffentlichung der Taxonomien 6.8)' },
  { version: '6.9', date: '2025-04-01', mandatoryForYearsBeginningAfter: '2025-12-31', bmfLetter: 'BMF-Schreiben vom 10.6.2025' },
]

/**
 * Element names for the Kontennachweis tuple and the Anlagenspiegel columns. Unverified: the taxonomy
 * package on esteuer.de was not reachable, so these names are our best reading and must be checked
 * against the 6.9 schema (and ERiC) before the first transmission. Kept in one place for that reason.
 */
export const E_BILANZ_DETAIL_ELEMENTS = {
  accountTuple: 'de-gaap-ci:accountBalances.detail',
  accountPosition: 'de-gaap-ci:accountBalances.detail.position',
  accountNumber: 'de-gaap-ci:accountBalances.detail.accountNo',
  accountLabel: 'de-gaap-ci:accountBalances.detail.accountName',
  accountBalance: 'de-gaap-ci:accountBalances.detail.balance',
  explanation: 'de-gaap-ci:accountBalances.explanationNotTransmitted',
  /** Suffixes appended to the position element (`bs.ass.fixAss.tan` + `.gross.addition`). */
  assetColumns: {
    acquisitionCostOpening: '.gross.beginning',
    additions: '.gross.addition',
    disposalsAtCost: '.gross.disposal',
    acquisitionCostClosing: '.gross.end',
    depreciationOpening: '.accDepr.beginning',
    depreciationOfYear: '.accDepr.DeprPeriod',
    depreciationOnDisposals: '.accDepr.disposal',
    depreciationClosing: '.accDepr.end',
    bookValueOpening: '.net.beginning',
    bookValueClosing: '.net.end',
  } satisfies Record<keyof AnlagespiegelColumns, string>,
} as const

/**
 * § 5b Abs. 1 S. 1 EStG i. d. F. JStG 2024 with § 52 Abs. 11 S. 3 EStG: unverdichtete Kontennachweise
 * for Wirtschaftsjahre beginning after 31.12.2024.
 */
export function kontennachweisRequired(fiscalYearBegin: IsoDate): boolean {
  return fiscalYearBegin > '2024-12-31'
}

/** The first taxonomy that carries Kontennachweise (BMF-Schreiben vom 10.6.2025). */
const FIRST_WITH_KONTENNACHWEIS = '6.9'

const versionIndex = (t: TaxonomyVersion): number => E_BILANZ_TAXONOMIES.findIndex((v) => v.version === t.version)

export class EBilanzError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EBilanzError'
  }
}

/** The mandatory taxonomy for a Wirtschaftsjahr beginning on `fiscalYearBegin`. */
export function taxonomyForFiscalYear(fiscalYearBegin: IsoDate): TaxonomyVersion {
  const applicable = E_BILANZ_TAXONOMIES.filter((t) => fiscalYearBegin > t.mandatoryForYearsBeginningAfter)
  const latest = applicable.at(-1)
  if (latest === undefined || fiscalYearBegin > '2026-12-31') {
    throw new EBilanzError(`Für ein Wirtschaftsjahr ab ${fiscalYearBegin} ist keine Taxonomie hinterlegt.`)
  }
  return latest
}

export interface EBilanzCompany {
  readonly name: string
  /** 13-digit Steuernummer in the ELSTER format (Bundesschema). */
  readonly steuernummer: string
  readonly street?: string
  readonly houseNumber?: string
  readonly zipCode?: string
  readonly city?: string
}

export interface EBilanzInput {
  readonly company: EBilanzCompany
  readonly fiscalYearBegin: IsoDate
  readonly fiscalYearEnd: IsoDate
  readonly balanceSheet: BalanceSheet
  readonly incomeStatement: IncomeStatement
  /** A Steuerbilanz, or a Handelsbilanz that the Überleitungsrechnung adjusts. */
  readonly statementType: 'steuerbilanz' | 'handelsbilanz'
  /**
   * Defaults to the mandatory version of the Wirtschaftsjahr; for 2025 to 6.9, because only 6.9 holds
   * the Kontennachweise the law requires from 2025 and the BMF allows it for 2025 already.
   */
  readonly taxonomy?: TaxonomyVersion
  /** From `kontennachweise` in closing.ts. */
  readonly kontennachweise?: readonly PositionedBalance[]
  /** With 6.9 only: why the Kontennachweise go to the Finanzamt another way (BMF-Schreiben vom 10.6.2025). */
  readonly kontennachweisExplanation?: string
  /** From `anlagespiegel` in assets.ts; a Mussfeld, also when empty. */
  readonly anlagespiegel: { readonly rows: readonly AnlagespiegelRow[] }
}

function chooseTaxonomy(input: EBilanzInput): TaxonomyVersion {
  const required = kontennachweisRequired(input.fiscalYearBegin)
  const firstWith = E_BILANZ_TAXONOMIES.find((t) => t.version === FIRST_WITH_KONTENNACHWEIS)!
  const mandatory = taxonomyForFiscalYear(input.fiscalYearBegin)
  const taxonomy = input.taxonomy ?? (required && versionIndex(mandatory) < versionIndex(firstWith) ? firstWith : mandatory)
  const canCarry = versionIndex(taxonomy) >= versionIndex(firstWith)
  if ((required || input.kontennachweise !== undefined) && !canCarry) {
    throw new EBilanzError(`Kontennachweise lassen sich erst ab Taxonomie ${FIRST_WITH_KONTENNACHWEIS} übermitteln.`)
  }
  if (required && input.kontennachweise === undefined) {
    const explained = (input.kontennachweisExplanation ?? '').trim() !== ''
    if (!explained || taxonomy.version !== FIRST_WITH_KONTENNACHWEIS) {
      throw new EBilanzError('Für dieses Wirtschaftsjahr gehören Kontennachweise in die E-Bilanz; ohne sie nur mit Taxonomie 6.9 und einer Begründung.')
    }
  }
  return taxonomy
}

function checkKontennachweise(rows: readonly PositionedBalance[], bs: BalanceSheet, is: IncomeStatement): void {
  const sums = new Map<string, number>()
  for (const r of rows) sums.set(r.position, (sums.get(r.position) ?? 0) + r.amount)
  const expected: [string, number][] = [
    ...Object.entries(bs.aktiva),
    ...Object.entries(bs.passiva).map(([p, v]): [string, number] => [p, p === 'P.A' ? v - bs.profit : v]),
    ...Object.entries(is.positions).map(([p, v]): [string, number] => [p, v ?? 0]),
  ]
  for (const [position, value] of expected) {
    if ((sums.get(position) ?? 0) !== value) throw new EBilanzError(`Der Kontennachweis zu ${position} ergibt nicht den Wert der Position.`)
  }
}

function checkAnlagespiegel(rows: readonly AnlagespiegelRow[], bs: BalanceSheet): void {
  for (const position of ['A.I', 'A.II', 'A.III'] as const) {
    const bookValue = rows.filter((r) => r.position === position).reduce((s, r) => s + r.bookValueClosing, 0)
    if (bookValue !== bs.aktiva[position]) throw new EBilanzError(`Der Anlagenspiegel zu ${position} passt nicht zur Bilanz.`)
  }
}

const AKTIVA: readonly BalanceSheetPosition[] = ['A.I', 'A.II', 'A.III', 'B.I', 'B.II', 'B.III', 'B.IV', 'C']
const PASSIVA: readonly BalanceSheetPosition[] = ['P.A', 'P.B', 'P.C', 'P.D']
const GUV_INCOME: readonly IncomeStatementPosition[] = ['GuV.1', 'GuV.2', 'GuV.4', 'GuV.11']
const GUV_EXPENSE: readonly IncomeStatementPosition[] = ['GuV.5', 'GuV.6', 'GuV.7', 'GuV.8', 'GuV.13', 'GuV.14', 'GuV.16']

const euros = (cents: number): string => {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

const esc = (value: string): string => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

/** The XBRL instance; throws when the Bilanz does not balance or the GuV profit differs from the Bilanz. */
export function eBilanzInstance(input: EBilanzInput): string {
  const { balanceSheet: bs, incomeStatement: is, company } = input
  if (bs.totalAktiva !== bs.totalPassiva) throw new EBilanzError('Aktiva und Passiva sind nicht gleich.')
  if (bs.profit !== is.profit) throw new EBilanzError('Der Gewinn der GuV weicht vom Gewinn der Bilanz ab.')
  if (!/^\d{13}$/.test(company.steuernummer)) throw new EBilanzError('Die Steuernummer muss 13 Ziffern im ELSTER-Format haben.')
  const taxonomy = chooseTaxonomy(input)
  if (input.kontennachweise !== undefined) checkKontennachweise(input.kontennachweise, bs, is)
  checkAnlagespiegel(input.anlagespiegel.rows, bs)
  const gcd = `http://www.xbrl.de/taxonomies/de-gcd-${taxonomy.date}`
  const gaap = `http://www.xbrl.de/taxonomies/de-gaap-ci-${taxonomy.date}`
  const year = input.fiscalYearEnd.slice(0, 4)
  const D = `D-${year}`
  const I = `I-${year}`
  // Opening values of the Anlagenspiegel are as of the previous closing date.
  const begin = new Date(`${input.fiscalYearBegin}T00:00:00Z`)
  begin.setUTCDate(begin.getUTCDate() - 1)
  const priorClosing = begin.toISOString().slice(0, 10)
  const P = `I-${priorClosing.slice(0, 4)}`
  const fact = (name: string, value: string, ctx: string = D): string => `  <${name} contextRef="${ctx}">${esc(value)}</${name}>`
  const money = (element: string, cents: number, ctx: string): string => `  <de-gaap-ci:${element} contextRef="${ctx}" unitRef="EUR" decimals="2">${euros(cents)}</de-gaap-ci:${element}>`
  const entity = `<xbrli:entity><xbrli:identifier scheme="http://www.rzf-nrw.de/Steuernummer">${company.steuernummer}</xbrli:identifier></xbrli:entity>`
  const location = [
    company.street === undefined ? null : fact('de-gcd:genInfo.company.id.location.street', company.street),
    company.houseNumber === undefined ? null : fact('de-gcd:genInfo.company.id.location.houseNo', company.houseNumber),
    company.zipCode === undefined ? null : fact('de-gcd:genInfo.company.id.location.zipCode', company.zipCode),
    company.city === undefined ? null : fact('de-gcd:genInfo.company.id.location.city', company.city),
  ].filter((l) => l !== null)
  const taxCode = input.statementType === 'steuerbilanz' ? 'S' : 'GAAP'
  const amount = (name: string, cents: number, ctx: string): string => `<${name} contextRef="${ctx}" unitRef="EUR" decimals="2">${euros(cents)}</${name}>`
  const el = (name: string, value: string, ctx: string): string => `<${name} contextRef="${ctx}">${esc(value)}</${name}>`
  const E = E_BILANZ_DETAIL_ELEMENTS
  const accountTuples = (input.kontennachweise ?? []).map((r) => {
    const ctx = r.position.startsWith('GuV') ? D : I
    return `  <${E.accountTuple}>${el(E.accountPosition, r.element, ctx)}${el(E.accountNumber, r.account, ctx)}${el(E.accountLabel, r.label, ctx)}${amount(E.accountBalance, r.amount, ctx)}</${E.accountTuple}>`
  })
  const explanation = input.kontennachweise === undefined && input.kontennachweisExplanation !== undefined
    ? [`  ${el(E.explanation, input.kontennachweisExplanation, D)}`]
    : []
  const assetFacts = input.anlagespiegel.rows.flatMap((r) =>
    (Object.keys(E.assetColumns) as (keyof AnlagespiegelColumns)[]).map((k) => {
      const ctx = k.endsWith('Opening') ? P : k.endsWith('Closing') ? I : D
      return `  ${amount(`de-gaap-ci:${r.element}${E.assetColumns[k]}`, r[k], ctx)}`
    }))
  const guvTotal = GUV_INCOME.reduce((s, p) => s + (is.positions[p] ?? 0), 0) - GUV_EXPENSE.reduce((s, p) => s + (is.positions[p] ?? 0), 0)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:link="http://www.xbrl.org/2003/linkbase" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:de-gcd="${gcd}" xmlns:de-gaap-ci="${gaap}">`,
    `  <link:schemaRef xlink:type="simple" xlink:href="${gcd}/de-gcd-${taxonomy.date}-shell.xsd"/>`,
    `  <link:schemaRef xlink:type="simple" xlink:href="${gaap}/de-gaap-ci-${taxonomy.date}-shell-fiscal.xsd"/>`,
    `  <xbrli:context id="${D}">${entity}<xbrli:period><xbrli:startDate>${input.fiscalYearBegin}</xbrli:startDate><xbrli:endDate>${input.fiscalYearEnd}</xbrli:endDate></xbrli:period></xbrli:context>`,
    `  <xbrli:context id="${I}">${entity}<xbrli:period><xbrli:instant>${input.fiscalYearEnd}</xbrli:instant></xbrli:period></xbrli:context>`,
    `  <xbrli:context id="${P}">${entity}<xbrli:period><xbrli:instant>${priorClosing}</xbrli:instant></xbrli:period></xbrli:context>`,
    '  <xbrli:unit id="EUR"><xbrli:measure>iso4217:EUR</xbrli:measure></xbrli:unit>',
    // GCD: Stammdaten of the report and of the company
    fact('de-gcd:genInfo.report.id.reportType.reportType.JA', 'Jahresabschluss'),
    fact('de-gcd:genInfo.report.id.reportStatus.reportStatus.E', 'endgültig'),
    fact('de-gcd:genInfo.report.id.revisionStatus.revisionStatus.E', 'erstmalig'),
    fact('de-gcd:genInfo.report.id.reportElement.reportElements.B', 'Bilanz'),
    fact('de-gcd:genInfo.report.id.reportElement.reportElements.GuV', 'GuV'),
    fact('de-gcd:genInfo.report.id.statementType.statementType.E', 'Einzelabschluss'),
    fact(`de-gcd:genInfo.report.id.statementType.tax.tax.${taxCode}`, input.statementType === 'steuerbilanz' ? 'Steuerbilanz' : 'Handelsbilanz'),
    fact('de-gcd:genInfo.report.id.incomeStatementFormat.incomeStatementFormat.GKV', 'Gesamtkostenverfahren'),
    fact('de-gcd:genInfo.report.id.consolidationRange.consolidationRange.EA', 'Einzelabschluss'),
    fact('de-gcd:genInfo.report.period.fiscalYearBegin', input.fiscalYearBegin),
    fact('de-gcd:genInfo.report.period.fiscalYearEnd', input.fiscalYearEnd),
    fact('de-gcd:genInfo.report.period.balSheetClosingDate', input.fiscalYearEnd),
    fact('de-gcd:genInfo.company.id.name', company.name),
    fact('de-gcd:genInfo.company.id.legalStatus.legalStatus.EU', 'Einzelunternehmen'),
    fact('de-gcd:genInfo.company.id.idNo.type.companyId.ST13', company.steuernummer),
    ...location,
    // GAAP: Bilanz at the closing date, GuV for the year
    ...AKTIVA.map((p) => money(E_BILANZ_ELEMENTS[p], bs.aktiva[p], I)),
    money(E_BILANZ_ELEMENTS['bs.ass'], bs.totalAktiva, I),
    ...PASSIVA.map((p) => money(E_BILANZ_ELEMENTS[p], bs.passiva[p], I)),
    money(E_BILANZ_ELEMENTS['bs.eqLiab'], bs.totalPassiva, I),
    ...[...GUV_INCOME, ...GUV_EXPENSE].map((p) => money(E_BILANZ_ELEMENTS[p], is.positions[p] ?? 0, D)),
    money(E_BILANZ_ELEMENTS['GuV.17'], guvTotal, D),
    ...assetFacts,
    ...accountTuples,
    ...explanation,
    '</xbrli:xbrl>',
    '',
  ].join('\n')
}
