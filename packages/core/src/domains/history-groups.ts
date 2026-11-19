import { mostFavourableCheck, type MostFavourableCheck } from '../engine/most-favourable-check'
import { isSupportedIncomeTaxYear } from '../math/tarif'
import { getTaxYearParameters } from '../math/tax-parameters'
import { annexNGreAmounts, type NGreInput } from './n-gre'
import { pensionAllowance, taxableSharePercent, usedTaxableShare, type PensionType } from './pension'
import { depreciationRatePercent } from './rental'
import { checkRentalRepairs, type RentalRepairsResult } from './rental-repairs'

/**
 * The groups of „Entwicklung“ (ADR-0099 §7): Grenzgänger, Vermieter, Kapital, Rentner. Each group exists
 * only when the household has data for it (null otherwise), and every figure comes from the core's rules.
 */

const round1 = (n: number) => Math.round(n * 10) / 10

// ---------------------------------------------------------------------------------------------
// Grenzgänger
// ---------------------------------------------------------------------------------------------

export interface CrossBorderYearFacts {
  readonly year: number
  /** The Swiss Lohnausweise of the year with their rate; a statement without a rate is left out by the API. */
  readonly statements: ReadonlyArray<{ readonly person: 'A' | 'B'; readonly nGre: NGreInput; readonly period: string }>
  /** The household's German gross wage of the year (LStB), for the Swiss share. */
  readonly germanGross: number
}

export interface CrossBorderYear {
  readonly year: number
  readonly person: 'A' | 'B'
  /** EUR per CHF. */
  readonly rate: number
  readonly period: string
  readonly grossChf: number
  readonly grossEur: number
  /** The change of the rate to the year before in %: what the euro figure moved by the rate alone. */
  readonly rateChangePercent: number | null
  readonly withholdingTaxChf: number
  /** The Quellensteuer credited in Germany (N-Gre Zeile 25): at most 4,5 % of the gross wage (DBA Art. 15a). */
  readonly creditedEur: number
  /** More was withheld than can be credited. */
  readonly creditCapped: boolean
}

export interface CrossBorderGroup {
  readonly years: readonly CrossBorderYear[]
  /** The Swiss wage's share of the household's gross wage, in %, one decimal. */
  readonly swissShare: ReadonlyArray<{ readonly year: number; readonly percent: number }>
}

export function crossBorderGroup(years: readonly CrossBorderYearFacts[]): CrossBorderGroup | null {
  const sorted = [...years].sort((a, b) => a.year - b.year)
  const rows: CrossBorderYear[] = []
  const swissShare: { year: number; percent: number }[] = []
  for (const y of sorted) {
    if (y.statements.length === 0) continue
    let swissEur = 0
    for (const s of y.statements) {
      const amounts = annexNGreAmounts(s.nGre)
      const previous = rows.find((r) => r.person === s.person && r.year === y.year - 1)
      const grossEur = Math.round(amounts.eur.z23)
      swissEur += grossEur
      rows.push({
        year: y.year,
        person: s.person,
        rate: s.nGre.rate,
        period: s.period,
        grossChf: amounts.chf.z23,
        grossEur,
        rateChangePercent: previous === undefined ? null : round1((s.nGre.rate / previous.rate - 1) * 100),
        withholdingTaxChf: s.nGre.withholdingTaxChf,
        creditedEur: Math.round(amounts.eur.z25),
        creditCapped: s.nGre.withholdingTaxChf > amounts.chf.z25,
      })
    }
    const total = swissEur + y.germanGross
    if (total > 0) swissShare.push({ year: y.year, percent: round1((swissEur / total) * 100) })
  }
  return rows.length === 0 ? null : { years: rows, swissShare }
}

// ---------------------------------------------------------------------------------------------
// Vermieter
// ---------------------------------------------------------------------------------------------

export interface RentalRepairFact {
  /** Erhaltungsaufwand, net of VAT, whole euros. */
  readonly amount: number
  /** When the work was done (ISO); null when not recorded. */
  readonly date: string | null
}

/** One object in one year, as the Vermietung mask keeps it; `propertyKey` follows it across the years. */
export interface RentalPropertyYearFacts {
  readonly propertyKey: string
  readonly year: number
  readonly label: string | null
  readonly income: number | null
  readonly umlagen: number | null
  readonly werbungskosten: number | null
  readonly schuldzinsen: number | null
  /** Acquisition cost of the building, the AfA basis. */
  readonly buildingCost: number | null
  readonly baujahr: number | null
  readonly acquiredOn: string | null
  readonly repairs: readonly RentalRepairFact[]
}

export interface RentalPropertyYear {
  readonly year: number
  /** Mieten + Umlagen − Werbungskosten − Schuldzinsen − AfA; null while a part is missing. */
  readonly result: number | null
  readonly missing: readonly string[]
  readonly depreciation: number | null
  /** The building's remaining book value at the end of the year; null without the acquisition date. */
  readonly bookValueEnd: number | null
}

export interface RentalGroupProperty {
  readonly propertyKey: string
  readonly label: string | null
  readonly acquiredOn: string | null
  readonly depreciation: { readonly annual: number; readonly ratePercent: number } | null
  readonly years: readonly RentalPropertyYear[]
  /** The book value at the end of the latest year. */
  readonly bookValue: number | null
  /** Full years of AfA left at the annual rate. */
  readonly yearsLeft: number | null
  /**
   * The 15 % limit of § 6 Abs. 1 Nr. 1a EStG over the stored repairs. A repair without a date counts as
   * done on the first day of its year (not before the purchase), so it is in the window rather than out:
   * warning too early costs nothing, too late costs the deduction.
   */
  readonly acquisitionRelated: (RentalRepairsResult & { readonly windowOpen: boolean; readonly undatedCounted: number }) | null
}

export interface RentalGroup {
  readonly properties: readonly RentalGroupProperty[]
}

/** The latest year's value of a fact the object keeps across years (cost, Baujahr, purchase date, address). */
function latest<R, T>(rows: readonly R[], pick: (r: R) => T | null): T | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const value = pick(rows[i]!)
    if (value !== null) return value
  }
  return null
}

function rentalProperty(rows: readonly RentalPropertyYearFacts[], today: string): RentalGroupProperty {
  const sorted = [...rows].sort((a, b) => a.year - b.year)
  const cost = latest(sorted, (r) => r.buildingCost)
  const baujahr = latest(sorted, (r) => r.baujahr)
  const acquiredOn = latest(sorted, (r) => r.acquiredOn)
  const ratePercent = baujahr === null ? null : depreciationRatePercent(baujahr)
  const annual = cost === null || ratePercent === null ? null : Math.round(cost * (ratePercent / 100))
  const acquisitionYear = acquiredOn === null ? null : Number(acquiredOn.slice(0, 4))

  let bookValue = cost
  const years = sorted.map((r): RentalPropertyYear => {
    let depreciation: number | null = annual
    if (annual !== null && acquisitionYear !== null && bookValue !== null) {
      // § 7 Abs. 1 Satz 4 EStG: in the year of purchase only the months from the month of purchase on.
      const months = r.year === acquisitionYear ? 13 - Number(acquiredOn!.slice(5, 7)) : r.year > acquisitionYear ? 12 : 0
      depreciation = Math.min(bookValue, Math.round((annual * months) / 12))
      bookValue -= depreciation
    }
    const missing = [...(r.income === null ? ['mieteinnahmen'] : []), ...(r.werbungskosten === null ? ['werbungskosten'] : []), ...(depreciation === null ? ['afa'] : [])]
    const result = missing.length > 0 ? null : r.income! + (r.umlagen ?? 0) - r.werbungskosten! - (r.schuldzinsen ?? 0) - depreciation!
    return { year: r.year, result, missing, depreciation, bookValueEnd: acquisitionYear === null ? null : bookValue }
  })
  const lastBookValue = acquisitionYear === null ? null : bookValue
  return {
    propertyKey: sorted[0]!.propertyKey,
    label: latest(sorted, (r) => r.label),
    acquiredOn,
    depreciation: annual === null ? null : { annual, ratePercent: ratePercent! },
    years,
    bookValue: lastBookValue,
    yearsLeft: lastBookValue === null || annual === null || annual === 0 ? null : Math.ceil(lastBookValue / annual),
    acquisitionRelated: acquisitionCheck(sorted, acquiredOn, cost, today),
  }
}

function acquisitionCheck(rows: readonly RentalPropertyYearFacts[], acquiredOn: string | null, cost: number | null, today: string): RentalGroupProperty['acquisitionRelated'] {
  if (acquiredOn === null || cost === null || cost <= 0) return null
  const repairs = rows.flatMap((r) =>
    r.repairs.map((repair) => ({ undated: repair.date === null, doneOn: repair.date ?? (`${r.year}-01-01` < acquiredOn ? acquiredOn : `${r.year}-01-01`), netEur: repair.amount })),
  )
  const result = checkRentalRepairs({ acquiredOn, buildingCostEur: cost, repairs })
  const undatedCounted = repairs.filter((r) => r.undated && r.doneOn >= acquiredOn && r.doneOn <= result.windowEnd).length
  return { ...result, windowOpen: today <= result.windowEnd, undatedCounted }
}

export function rentalGroup(rows: readonly RentalPropertyYearFacts[], today: string): RentalGroup | null {
  if (rows.length === 0) return null
  const byKey = new Map<string, RentalPropertyYearFacts[]>()
  for (const row of rows) byKey.set(row.propertyKey, [...(byKey.get(row.propertyKey) ?? []), row])
  return { properties: [...byKey.values()].map((list) => rentalProperty(list, today)) }
}

// ---------------------------------------------------------------------------------------------
// Kapital
// ---------------------------------------------------------------------------------------------

/** The Sparer-Pauschbetrag of years before the core's tariff years (§ 20 Abs. 9 EStG). */
const EARLIER_SAVER_ALLOWANCE = { single: 801, joint: 1_602 }

export interface CapitalYearFacts {
  readonly year: number
  readonly filingType: 'einzel' | 'zusammen'
  readonly income: number | null
  /** The allowance the bank's certificate says was used (Freistellungsauftrag); null when not recorded. */
  readonly allowanceUsed: number | null
  /** The zvE of the Bescheid; null without one. */
  readonly zvE: number | null
}

export interface CapitalYear {
  readonly year: number
  readonly income: number
  readonly allowanceLimit: number
  readonly allowanceUsed: number
  readonly aboveAllowance: number
  readonly fullyUsed: boolean
  /** The Günstigerprüfung on the Bescheid's zvE; null without a Bescheid or a tariff. */
  readonly favourableCheck: Pick<MostFavourableCheck, 'statement' | 'delta'> & { readonly recommendation: 'abgeltung' | 'persoenlich' | null } | null
}

export interface CapitalGroup {
  readonly years: readonly CapitalYear[]
}

function saverAllowance(year: number, filingType: 'einzel' | 'zusammen'): number {
  if (!isSupportedIncomeTaxYear(year)) return filingType === 'zusammen' ? EARLIER_SAVER_ALLOWANCE.joint : EARLIER_SAVER_ALLOWANCE.single
  const sums = getTaxYearParameters(year).lumpSums
  return filingType === 'zusammen' ? sums.saverJoint : sums.saverSingle
}

export function capitalGroup(years: readonly CapitalYearFacts[]): CapitalGroup | null {
  const rows = [...years]
    .filter((y) => y.income !== null && y.income > 0)
    .sort((a, b) => a.year - b.year)
    .map((y): CapitalYear => {
      const income = y.income!
      const allowanceLimit = saverAllowance(y.year, y.filingType)
      const allowanceUsed = y.allowanceUsed ?? Math.min(income, allowanceLimit)
      const check =
        y.zvE === null || !isSupportedIncomeTaxYear(y.year)
          ? null
          : mostFavourableCheck({ kapitalertraege: Math.round(income), remainingZvE: Math.max(0, Math.round(y.zvE)), year: y.year, assessmentType: y.filingType, progressionClause: { kind: 'keine' } })
      return {
        year: y.year,
        income,
        allowanceLimit,
        allowanceUsed,
        aboveAllowance: Math.max(0, income - allowanceLimit),
        fullyUsed: allowanceUsed >= allowanceLimit,
        favourableCheck: check === null ? null : { statement: check.statement, delta: check.delta, recommendation: check.statement === 'eindeutig' ? check.recommendation : null },
      }
    })
  return rows.length === 0 ? null : { years: rows }
}

// ---------------------------------------------------------------------------------------------
// Rentner
// ---------------------------------------------------------------------------------------------

export interface PensionYearFacts {
  readonly year: number
  readonly kind: PensionType | null
  readonly amount: number | null
  readonly startYear: number | null
}

export interface PensionGroup {
  readonly startYear: number | null
  /** The Besteuerungsanteil of the start year; null for a pension taxed otherwise or without a start year. */
  readonly sharePercent: number | null
  /** The Rentenfreibetrag, fixed from the first full year; null while that year is not recorded. */
  readonly allowance: number | null
  readonly allowanceYear: number | null
  readonly years: ReadonlyArray<{ readonly year: number; readonly amount: number | null; readonly taxablePart: number | null }>
}

export function pensionGroup(years: readonly PensionYearFacts[]): PensionGroup | null {
  const rows = [...years].filter((y) => y.amount !== null && y.amount > 0).sort((a, b) => a.year - b.year)
  if (rows.length === 0) return null
  const startYear = latest(rows, (r) => r.startYear)
  const kind = latest(rows, (r) => r.kind)
  const sharePercent = startYear === null || (kind !== null && !usedTaxableShare(kind)) ? null : taxableSharePercent(startYear)
  const allowanceYear = sharePercent === null ? null : startYear! + 1
  const firstFull = allowanceYear === null ? undefined : rows.find((r) => r.year === allowanceYear)
  const allowance = firstFull === undefined || sharePercent === null ? null : pensionAllowance(firstFull.amount!, sharePercent)
  return {
    startYear,
    sharePercent,
    allowance,
    allowanceYear,
    years: rows.map((r) => {
      const amount = r.amount!
      const taxablePart =
        sharePercent === null ? null : r.year === startYear ? Math.round((amount * sharePercent) / 100) : allowance !== null && r.year > startYear! ? Math.max(0, amount - allowance) : null
      return { year: r.year, amount, taxablePart }
    }),
  }
}
