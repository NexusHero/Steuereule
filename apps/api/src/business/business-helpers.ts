import {
  checkSmallBusiness,
  smallBusinessCutoff,
  AssetError,
  ClosingError,
  EBilanzError,
  LedgerError,
  chartAccounts,
  euerProfit,
  euerTotals,
  incomeStatement,
  type BankTransaction,
  type BookingTaxKey,
  type ChartOfAccounts,
  type ElsterForm,
  type Ledger,
  type ProfessionAnswers,
} from '@steuereule/core'
import { InvalidInputError } from '../common/domain-error.js'
import type { BusinessProfilePatch, BusinessProfileRecord } from './business.repository.js'
import { deductibleByKeyInEuros, eur, type VatFigures } from './business-ledger.js'
import type { SmallBusinessCheck } from './views.js'

export const parseJson = <T>(value: string | null, fallback: T): T => {
  if (value === null) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export const isoNow = (): string => new Date().toISOString()

/** The four yes/no profession questions: one not answered yet counts as „Nein“. */
export function withDefaultAnswers(answers: Partial<ProfessionAnswers>): ProfessionAnswers {
  return { ...answers, ownExpertWork: answers.ownExpertWork ?? false, employsQualifiedStaff: answers.employsQualifiedStaff ?? false, leadsPersonally: answers.leadsPersonally ?? false, tradesGoods: answers.tradesGoods ?? false }
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function emptyTransaction(): Omit<BankTransaction, 'amount'> {
  return { accountIban: null, bookingDate: '1970-01-01', valueDate: null, currency: 'EUR', counterpartyName: null, counterpartyIban: null, reference: '', endToEndId: null, bankReference: null }
}

/** The core's own errors carry German messages for the user: they become a 400 with that message. */
export function ledgerCall<T>(work: () => T): T {
  try {
    return work()
  } catch (error) {
    if (error instanceof LedgerError) throw new InvalidInputError(`LEDGER_${error.code.toUpperCase()}`, error.message)
    if (error instanceof ClosingError || error instanceof AssetError || error instanceof EBilanzError || error instanceof RangeError) {
      throw new InvalidInputError('BUSINESS_RULE', error.message)
    }
    throw error
  }
}

/** Gesamtumsatz as § 19 Abs. 3 UStG counts it, read off the book: taxable, tax-free and Kleinunternehmer turnover. */
export function turnoverOf(f: VatFigures): number {
  return round2((f.taxableNetEur.standard ?? 0) + (f.taxableNetEur.reduced ?? 0) + f.smallBusinessTurnoverEur + f.taxFreeWithDeductionEur + f.taxFreeWithoutDeductionEur)
}

export function smallBusinessCheckOf(
  year: number,
  profile: BusinessProfileRecord | null,
  turnoverEur: number,
  priorYearTurnoverEur: number | null,
  supplies: readonly { readonly date: string; readonly netEur: number }[] = [],
): SmallBusinessCheck {
  const start = profile?.startDate ?? null
  const foundingYear = start !== null && Number(start.slice(0, 4)) === year
  const monthsActive = foundingYear ? 12 - Number(start.slice(5, 7)) + 1 : 12
  // Started during the year before: until 2024 its turnover is annualised (§ 19 Abs. 3 Satz 3 UStG a. F.).
  const startedYearBefore = start !== null && Number(start.slice(0, 4)) === year - 1
  const result = checkSmallBusiness({
    year,
    priorYearTurnoverEur: foundingYear ? 0 : (priorYearTurnoverEur ?? 0),
    currentYearTurnoverEur: turnoverEur,
    ...(foundingYear ? { founding: { monthsActive } } : {}),
    ...(startedYearBefore ? { priorYearMonthsActive: 12 - Number(start.slice(5, 7)) + 1 } : {}),
  })
  const taxedFrom = result.crossed === 'current_year' ? smallBusinessCutoff({ year, founding: foundingYear, supplies }) : null
  return { ...result, foundingYear, priorYearKnown: foundingYear || priorYearTurnoverEur !== null, turnoverEur, matchesProfile: !(profile?.smallBusiness === true && !result.eligible), taxedFrom }
}

/** Tax keys that carry no VAT amount: they only say what kind of turnover a line is. */
export const LABEL_ONLY_TAX_KEYS: ReadonlySet<BookingTaxKey> = new Set<BookingTaxKey>(['kleinunternehmer', 'steuerfrei', 'igLieferung', 'ust0', 'euLeistung'])

export function taxKeyOfAccount(chart: ChartOfAccounts, number: string): BookingTaxKey {
  return chartAccounts(chart).find((a) => a.number === number)?.defaultTaxKey ?? 'none'
}

/** The profile fields that belong to the person, not to one business (ADR-0101 §22). */
const PERSON_WIDE = ['smallBusiness', 'vatMethod', 'vatPrepayments', 'vatPeriodFacts', 'lossFacts', 'partnershipShares'] as const

export function personWideOf(record: Partial<BusinessProfileRecord> | null): BusinessProfilePatch {
  if (record === null) return {}
  return Object.fromEntries(PERSON_WIDE.filter((key) => record[key] !== undefined).map((key) => [key, record[key]])) as BusinessProfilePatch
}

export function withoutPersonWide(patch: BusinessProfilePatch): BusinessProfilePatch {
  return Object.fromEntries(Object.entries(patch).filter(([key]) => !(PERSON_WIDE as readonly string[]).includes(key))) as BusinessProfilePatch
}

/** Forms of the person, not of one business: one VAT return for the Unternehmer, the § 10d lines of the return. */
export const PERSON_FORMS: ReadonlySet<ElsterForm> = new Set<ElsterForm>(['ust-2-a', 'est-1-a', 'anlage-sonstiges'])

/** Net debit of the private accounts in the year, euros: positive = more withdrawn than deposited. */
export function privateBalanceEur(ledger: Ledger, year: number): number {
  const privateAccounts = new Set(chartAccounts(ledger.chart).filter((a) => a.kind === 'private').map((a) => a.number))
  let cents = 0
  for (const entry of ledger.entries) {
    if (Number(entry.date.slice(0, 4)) !== year) continue
    for (const line of entry.lines) if (privateAccounts.has(line.account)) cents += line.side === 'debit' ? line.amount : -line.amount
  }
  return eur(cents)
}

/**
 * § 34 Abs. 3 Satz 4 EStG: the reduced rate for one gain only (the largest that asks for it); every other
 * gain with § 34 takes the Fünftelregelung (ADR-0101 §22).
 */
export function extraordinaryOf(gains: readonly { gainEur: number; method: 'fuenftel' | 'ermaessigt' }[]): { gainEur: number; method: 'fuenftel' | 'ermaessigt'; fifthGainEur?: number } {
  const reduced = gains.filter((g) => g.method === 'ermaessigt').sort((a, b) => b.gainEur - a.gainEur)[0]
  const total = round2(gains.reduce((s, g) => s + g.gainEur, 0))
  if (!reduced) return { gainEur: total, method: 'fuenftel' }
  const rest = round2(total - reduced.gainEur)
  return { gainEur: reduced.gainEur, method: 'ermaessigt', ...(rest > 0 ? { fifthGainEur: rest } : {}) }
}

/** The profit of the year in euros from the book, the restricted expenses applied (EÜR) or the GuV (Bilanz). */
export function profitOf(ledger: Ledger, year: number): number {
  if (ledger.mode === 'euer') return euerProfit(year, deductibleByKeyInEuros(euerTotals(ledger, year))).profitEur
  return eur(incomeStatement(ledger, year).profit)
}
