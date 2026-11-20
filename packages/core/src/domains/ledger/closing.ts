import type { EuerKey } from '../business/euer-keys'
import {
  accountFor,
  chartAccounts,
  E_BILANZ_ELEMENTS,
  findAccount,
  type BalanceSheetPosition,
  type ChartOfAccounts,
  type IncomeStatementPosition,
  type LedgerAccount,
} from './accounts'
import { accountTotals, euerYearOf, yearOf, type EntryDraft, type EntryDraftLine, type JournalEntry, type Ledger } from './journal'

/**
 * Closing a year (ADR-0101 §15): trial balance, EÜR totals per EuerKey (cash basis), GuV and Bilanz
 * (accrual) with the Eröffnungsbilanz carried into the next year.
 *
 * Private accounts and the profit are closed into the capital account when the year is carried
 * forward, not by entries in the closed year: the Bilanz shows them in the capital, the next year
 * opens with one capital balance.
 */

export class ClosingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ClosingError'
  }
}

const inYear = (year: number) => (e: JournalEntry): boolean => yearOf(e.date) === year

function account(chart: ChartOfAccounts, number: string): LedgerAccount {
  const found = findAccount(chart, number)
  if (found === null) throw new ClosingError(`Konto ${number} gibt es im ${chart} nicht.`)
  return found
}

// ---------------------------------------------------------------------------------------------------
// Trial balance (Summen- und Saldenliste)

export interface TrialBalanceRow {
  readonly account: string
  readonly label: string
  readonly debit: number
  readonly credit: number
  /** Debit minus credit. */
  readonly balance: number
}

export interface TrialBalance {
  readonly rows: readonly TrialBalanceRow[]
  readonly totalDebit: number
  readonly totalCredit: number
}

export function trialBalance(ledger: Ledger, from: string, to: string): TrialBalance {
  const totals = accountTotals(ledger.entries, (e) => e.date >= from && e.date <= to)
  const rows = [...totals.entries()]
    .map(([number, t]) => ({ account: number, label: account(ledger.chart, number).label, debit: t.debit, credit: t.credit, balance: t.debit - t.credit }))
    .sort((a, b) => a.account.localeCompare(b.account))
  return { rows, totalDebit: rows.reduce((s, r) => s + r.debit, 0), totalCredit: rows.reduce((s, r) => s + r.credit, 0) }
}

// ---------------------------------------------------------------------------------------------------
// EÜR (§ 4 Abs. 3 EStG)

export function isIncomeKey(key: EuerKey): boolean {
  return key.startsWith('einnahmen_') || key === 'gewinn_iab_hinzurechnung'
}

export interface EuerTotals {
  readonly year: number
  /** Positive amounts per key: Einnahmen for income keys, Ausgaben for the others. */
  readonly byKey: Readonly<Partial<Record<EuerKey, number>>>
  /** The part of `byKey` booked on accounts marked not (fully) deductible; the tax rules apply the limits. */
  readonly nonDeductible: Readonly<Partial<Record<EuerKey, number>>>
  readonly einnahmen: number
  readonly ausgaben: number
  /** Einnahmen minus Ausgaben as booked, before the tax rules adjust restricted expenses. */
  readonly ueberschuss: number
}

export function euerTotals(ledger: Ledger, year: number): EuerTotals {
  if (ledger.mode !== 'euer') throw new ClosingError('Die EÜR wird aus einem Buch nach Zufluss und Abfluss abgeleitet, nicht aus einer Bilanz-Buchführung.')
  const byKey: Partial<Record<EuerKey, number>> = {}
  const nonDeductible: Partial<Record<EuerKey, number>> = {}
  const add = (target: Partial<Record<EuerKey, number>>, key: EuerKey, amount: number): void => {
    target[key] = (target[key] ?? 0) + amount
  }
  for (const entry of ledger.entries) {
    if (euerYearOf(entry) !== year) continue
    // Tax lines follow the base line they were derived from (journal.ts expands them in that order).
    let base: LedgerAccount | null = null
    for (const line of entry.lines) {
      const a = account(ledger.chart, line.account)
      if (line.taxPart !== 'tax') base = a
      if (a.euer === null) continue
      let key: EuerKey = line.taxPart === 'tax' && base !== null && base.vatEuer !== null && a.euer === 'einnahmen_umsatzsteuer_vereinnahmt' ? base.vatEuer : a.euer
      let amount: number
      if (a.euerCredit !== null && line.side === 'credit') {
        key = a.euerCredit
        amount = line.amount
      } else if (a.euerCredit !== null) {
        amount = line.amount
      } else {
        const towardKey = isIncomeKey(key) ? 'credit' : 'debit'
        amount = line.side === towardKey ? line.amount : -line.amount
      }
      add(byKey, key, amount)
      if (a.nonDeductible) add(nonDeductible, key, amount)
    }
  }
  let einnahmen = 0
  let ausgaben = 0
  for (const [key, amount] of Object.entries(byKey) as [EuerKey, number][]) {
    if (isIncomeKey(key)) einnahmen += amount
    else ausgaben += amount
  }
  return { year, byKey, nonDeductible, einnahmen, ausgaben, ueberschuss: einnahmen - ausgaben }
}

// ---------------------------------------------------------------------------------------------------
// GuV (§ 275 Abs. 2 HGB)

const INCOME_POSITIONS: ReadonlySet<IncomeStatementPosition> = new Set(['GuV.1', 'GuV.2', 'GuV.4', 'GuV.11'])

export interface IncomeStatement {
  readonly year: number
  /** Income positions as earned, expense positions as spent; both positive in the normal case. */
  readonly positions: Readonly<Partial<Record<IncomeStatementPosition, number>>>
  /** Jahresüberschuss (positive) or Jahresfehlbetrag (negative). */
  readonly profit: number
}

export function incomeStatement(ledger: Ledger, year: number): IncomeStatement {
  const positions: Partial<Record<IncomeStatementPosition, number>> = {}
  let profit = 0
  for (const [number, t] of accountTotals(ledger.entries, inYear(year))) {
    const a = account(ledger.chart, number)
    if (a.kind !== 'revenue' && a.kind !== 'expense') continue
    const net = t.credit - t.debit
    profit += net
    const position = a.hgb as IncomeStatementPosition
    positions[position] = (positions[position] ?? 0) + (INCOME_POSITIONS.has(position) ? net : -net)
  }
  return { year, positions, profit }
}

// ---------------------------------------------------------------------------------------------------
// Bilanz (§ 266 HGB)

const AKTIVA: readonly BalanceSheetPosition[] = ['A.I', 'A.II', 'A.III', 'B.I', 'B.II', 'B.III', 'B.IV', 'C']
const PASSIVA: readonly BalanceSheetPosition[] = ['P.A', 'P.B', 'P.C', 'P.D']
const isAktiva = (p: BalanceSheetPosition): boolean => !p.startsWith('P.')

export interface EquityDevelopment {
  readonly opening: number
  readonly deposits: number
  readonly withdrawals: number
  readonly profit: number
  readonly closing: number
}

export interface BalanceSheet {
  readonly year: number
  readonly aktiva: Readonly<Record<BalanceSheetPosition, number>>
  readonly passiva: Readonly<Record<BalanceSheetPosition, number>>
  readonly totalAktiva: number
  readonly totalPassiva: number
  readonly equity: EquityDevelopment
  readonly profit: number
}

const isOpeningEntry = (chart: ChartOfAccounts) => (e: JournalEntry): boolean => {
  const opening = accountFor(chart, 'opening_balances').number
  return e.lines.some((l) => l.account === opening)
}

export interface PositionedBalance {
  readonly account: string
  readonly label: string
  readonly position: BalanceSheetPosition | IncomeStatementPosition
  /** E-Bilanz element of the position. */
  readonly element: string
  /** Signed as the position shows it: assets and expenses by their debit, the others by their credit balance. */
  readonly amount: number
}

/**
 * Every account with a balance in the year, placed on its Bilanz or GuV position. VAT accounts go one
 * by one to the position their net balance lands on, so each position is the sum of its accounts
 * (the capital position adds the profit of the year, which is no account).
 */
function positionedBalances(ledger: Ledger, year: number): readonly PositionedBalance[] {
  const rows: PositionedBalance[] = []
  const vat: { a: LedgerAccount; balance: number }[] = []
  let openingResidual = 0
  for (const [number, t] of accountTotals(ledger.entries, inYear(year))) {
    const a = account(ledger.chart, number)
    const balance = t.debit - t.credit
    if (a.kind === 'opening') { openingResidual += balance; continue }
    if (balance === 0) continue
    if (a.netsWithVat) { vat.push({ a, balance }); continue }
    let position: BalanceSheetPosition | IncomeStatementPosition
    let amount: number
    if (a.kind === 'revenue' || a.kind === 'expense') {
      position = a.hgb as IncomeStatementPosition
      amount = INCOME_POSITIONS.has(position) ? -balance : balance
    } else {
      const natural = a.kind === 'asset' ? balance >= 0 : balance <= 0
      position = (natural ? a.hgb : (a.hgbIfOtherSide ?? a.hgb)) as BalanceSheetPosition
      amount = isAktiva(position) ? balance : -balance
    }
    rows.push({ account: number, label: a.label, position, element: E_BILANZ_ELEMENTS[position], amount })
  }
  if (openingResidual !== 0) throw new ClosingError(`Der Saldenvortrag ist nicht ausgeglichen (Rest ${openingResidual} Cent).`)
  const vatNet = vat.reduce((s, v) => s + v.balance, 0)
  const vatPosition: BalanceSheetPosition = vatNet >= 0 ? 'B.II' : 'P.C'
  for (const { a, balance } of vat) {
    rows.push({ account: a.number, label: a.label, position: vatPosition, element: E_BILANZ_ELEMENTS[vatPosition], amount: vatNet >= 0 ? balance : -balance })
  }
  return rows
}

const POSITION_ORDER: readonly string[] = [...AKTIVA, ...PASSIVA, 'GuV.1', 'GuV.2', 'GuV.4', 'GuV.5', 'GuV.6', 'GuV.7', 'GuV.8', 'GuV.11', 'GuV.13', 'GuV.14', 'GuV.16']

/**
 * The unverdichtete Kontennachweise (§ 5b Abs. 1 S. 1 EStG i. d. F. JStG 2024, for Wirtschaftsjahre
 * beginning after 31.12.2024): per position each account with a balance at year end, with number,
 * label and balance (BMF-Schreiben vom 10.6.2025). Sorted by position, then account.
 */
export function kontennachweise(ledger: Ledger, year: number): readonly PositionedBalance[] {
  if (ledger.mode !== 'bilanz') throw new ClosingError('Kontennachweise gehören zur E-Bilanz, also zur Bilanz-Buchführung.')
  return [...positionedBalances(ledger, year)].sort((a, b) => POSITION_ORDER.indexOf(a.position) - POSITION_ORDER.indexOf(b.position) || a.account.localeCompare(b.account))
}

/** The Bilanz at 31.12. of the year from that year's entries, the opening entry included. */
export function balanceSheet(ledger: Ledger, year: number): BalanceSheet {
  if (ledger.mode !== 'bilanz') throw new ClosingError('Eine Bilanz setzt die Buchführung nach dem Bilanzprinzip voraus.')
  const positions = Object.fromEntries([...AKTIVA, ...PASSIVA].map((p) => [p, 0])) as Record<BalanceSheetPosition, number>
  const profit = incomeStatement(ledger, year).profit
  for (const row of positionedBalances(ledger, year)) {
    if (row.position in positions) positions[row.position as BalanceSheetPosition] += row.amount
  }
  positions['P.A'] += profit
  let equityBalance = 0
  let deposits = 0
  let withdrawals = 0
  for (const [number, t] of accountTotals(ledger.entries, inYear(year))) {
    const kind = account(ledger.chart, number).kind
    if (kind === 'equity') equityBalance += t.credit - t.debit
    if (kind === 'private') { deposits += t.credit; withdrawals += t.debit }
  }
  let opening = 0
  for (const [number, t] of accountTotals(ledger.entries.filter(isOpeningEntry(ledger.chart)))) {
    if (account(ledger.chart, number).kind === 'equity') opening += t.credit - t.debit
  }
  const pick = (list: readonly BalanceSheetPosition[]): Record<BalanceSheetPosition, number> => Object.fromEntries(list.map((p) => [p, positions[p]])) as Record<BalanceSheetPosition, number>
  const aktiva = pick(AKTIVA)
  const passiva = pick(PASSIVA)
  const sumOf = (r: Record<string, number>): number => Object.values(r).reduce((s, v) => s + v, 0)
  return {
    year,
    aktiva,
    passiva,
    totalAktiva: sumOf(aktiva),
    totalPassiva: sumOf(passiva),
    equity: { opening, deposits, withdrawals, profit, closing: equityBalance + deposits - withdrawals + profit },
    profit,
  }
}

export interface ClosingBalance {
  readonly account: string
  readonly side: 'debit' | 'credit'
  readonly amount: number
}

/**
 * The balances that open the next year: every balance-sheet account with a balance, the private
 * accounts and the profit closed into the variable capital account.
 */
export function closingBalances(ledger: Ledger, year: number): readonly ClosingBalance[] {
  if (ledger.mode !== 'bilanz') throw new ClosingError('Saldenvorträge gibt es nur in der Bilanz-Buchführung.')
  const capital = accountFor(ledger.chart, 'variable_capital').number
  const byAccount = new Map<string, number>()
  let capitalBalance = -incomeStatement(ledger, year).profit
  for (const [number, t] of accountTotals(ledger.entries, inYear(year))) {
    const a = account(ledger.chart, number)
    if (a.kind === 'revenue' || a.kind === 'expense' || a.kind === 'opening') continue
    const balance = t.debit - t.credit
    if (a.kind === 'private' || number === capital) capitalBalance += balance
    else byAccount.set(number, balance)
  }
  byAccount.set(capital, capitalBalance)
  return [...byAccount.entries()]
    .filter(([, b]) => b !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([number, b]) => ({ account: number, side: b > 0 ? 'debit' : 'credit', amount: Math.abs(b) }))
}

/** The Eröffnungsbilanz entry of `year`: each balance against the Saldenvortrag account, dated 1.1. */
export function openingEntryDraft(chart: ChartOfAccounts, balances: readonly ClosingBalance[], year: number): EntryDraft {
  const opening = accountFor(chart, 'opening_balances').number
  const lines: EntryDraftLine[] = []
  for (const b of balances) {
    account(chart, b.account)
    lines.push({ account: b.account, side: b.side, amount: b.amount }, { account: opening, side: b.side === 'debit' ? 'credit' : 'debit', amount: b.amount })
  }
  return { date: `${year}-01-01`, documentNumber: `EB-${year}`, text: `Eröffnungsbilanz ${year}`, lines }
}

/** The accounts of a chart that a Bilanz or GuV can show, for a UI listing positions with their accounts. */
export function accountsOfPosition(chart: ChartOfAccounts, position: BalanceSheetPosition | IncomeStatementPosition): readonly LedgerAccount[] {
  return chartAccounts(chart).filter((a) => a.hgb === position)
}
