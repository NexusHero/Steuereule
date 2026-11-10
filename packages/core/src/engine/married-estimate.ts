import type { Range, TaxEstimate } from './tax-estimate'
import { childTaxAllowance } from '../domains/children'
import { applyHouseholdTaxReduction } from '../domains/household-services'
import { calculateExtraordinaryBurden, type BurdenChildrenBracket } from '../domains/extraordinary-burdens'
import { isSupportedIncomeTaxYear, soliExemptionLimits, solidaritaetszuschlag, splittingTariff } from '../math/tarif'
import { getTaxYearParameters } from '../math/tax-parameters'

/** One spouse's wage income, as either the German Lohnsteuerbescheinigung or the Swiss Anlage N-Gre gives it. */
export type SpouseIncome =
  | {
      readonly kind: 'employee'
      readonly grossWage: number
      readonly wageTax: number
      readonly socialSecurity: number
      readonly commuteAllowance: number
      /** Self-paid health and care insurance, already in its deductible amount. */
      readonly selfPaidHealthCare: number
    }
  | {
      readonly kind: 'crossBorder'
      /** Anlage N-Gre Z. 23. */
      readonly wageEur: number
      /** Anlage N-Gre Z. 25: the creditable Swiss withholding tax. */
      readonly swissWithholdingEur: number
      /** Anlage N-Gre Z. 85. */
      readonly pensionContributionsEur: number
      /** Anlage N-Gre Z. 82. */
      readonly otherProvisionEur: number
      readonly commuteAllowance: number
      readonly selfPaidHealthCare: number
    }

export interface MarriedEstimateInput {
  readonly year: number
  readonly a: SpouseIncome
  /** null when Person B has no wage income. */
  readonly b: SpouseIncome | null
  readonly children: number
  /** Kindergeld the couple is entitled to for the year (the comparison adds it back when the allowance wins). */
  readonly childBenefit: number
  readonly rentalSurplus: number
  readonly donations: number
  /** At least one spouse belongs to a church levying Kirchensteuer. */
  readonly churchMember: boolean
  /** § 35a EStG joint tax reduction in EUR (optional, defaults to 0). */
  readonly householdReductionEur?: number | undefined
  /** § 33 EStG joint medical expenses in EUR (optional, defaults to 0). */
  readonly healthExpensesEur?: number | undefined
  /** Optional § 33 Abs. 3 children bracket override when count distinguishes 2 from 3+ elsewhere. */
  readonly childrenBracket?: BurdenChildrenBracket | undefined
}

export type MarriedEstimate =
  | (Extract<TaxEstimate, { kind: 'spanne' }> & {
      readonly childAllowanceUsed: boolean
      readonly churchTax: Range
      /** German wage tax was withheld, and with it Kirchensteuer we do not know — then it stays out of the result. */
      readonly churchTaxOpen: boolean
    })
  | { readonly kind: 'nicht-moeglich'; readonly reason: 'jahr-ohne-tarif' }

/** Deductible share of German employee social security (see steuerschaetzung.ts). */
const SOCIAL_SECURITY_DEDUCTIBLE: Range = { from: 0.91, to: 0.93 }
/** Kirchensteuer is 8 % in Baden-Württemberg and Bayern, 9 % elsewhere — a range until the Land is known. */
const CHURCH_TAX_RATE: Range = { from: 0.08, to: 0.09 }

interface SpouseFigures {
  readonly income: number
  readonly provision: Range
  readonly credit: number
}

function spouseFigures(s: SpouseIncome, year: number): SpouseFigures {
  const params = getTaxYearParameters(year)
  if (s.kind === 'employee') {
    return {
      income: s.grossWage - Math.max(params.lumpSums.employee, s.commuteAllowance),
      provision: {
        from: Math.round(s.socialSecurity * SOCIAL_SECURITY_DEDUCTIBLE.from) + s.selfPaidHealthCare,
        to: Math.round(s.socialSecurity * SOCIAL_SECURITY_DEDUCTIBLE.to) + s.selfPaidHealthCare,
      },
      credit: s.wageTax + solidaritaetszuschlag(s.wageTax, soliExemptionLimits(year as never).single),
    }
  }
  const other = Math.max(
    s.selfPaidHealthCare,
    Math.min(params.maxOtherProvisionEur, s.selfPaidHealthCare + s.otherProvisionEur),
  )
  return {
    income: s.wageEur - Math.max(params.lumpSums.employee, s.commuteAllowance),
    provision: { from: s.pensionContributionsEur + s.selfPaidHealthCare, to: s.pensionContributionsEur + other },
    credit: s.swissWithholdingEur,
  }
}

/**
 * A ranged estimate for a married couple filing jointly (ADR-0054): splitting tariff, the Kindergeld /
 * Kinderfreibetrag comparison, Soli on the tax after child allowances, rental surplus as income and
 * Kirchensteuer as a range. Never a point value (product ADR-015).
 */
export function estimateMarriedCouple(input: MarriedEstimateInput): MarriedEstimate {
  if (!isSupportedIncomeTaxYear(input.year)) return { kind: 'nicht-moeglich', reason: 'jahr-ohne-tarif' }
  const params = getTaxYearParameters(input.year)
  const spouses = [input.a, ...(input.b ? [input.b] : [])].map((s) => spouseFigures(s, input.year))
  const income = spouses.reduce((sum, s) => sum + s.income, 0) + input.rentalSurplus
  const gdeEur = Math.max(0, income)
  const bracket: BurdenChildrenBracket =
    input.childrenBracket ?? (input.children >= 3 ? '3+' : input.children >= 1 ? '1-2' : '0')
  const deductibleBurdenEur =
    (input.healthExpensesEur ?? 0) > 0
      ? Math.round(
          calculateExtraordinaryBurden({
            year: input.year,
            gdeEur,
            expensesEur: input.healthExpensesEur ?? 0,
            filing: 'zusammen',
            childrenBracket: bracket,
          }).deductibleEur,
        )
      : 0
  const provision = {
    from: spouses.reduce((sum, s) => sum + s.provision.from, 0),
    to: spouses.reduce((sum, s) => sum + s.provision.to, 0),
  }
  const specialExpenses = Math.max(params.lumpSums.specialExpensesJoint, input.donations)
  const taxableIncome = (deduction: number) => Math.max(0, income - deduction - specialExpenses - deductibleBurdenEur)
  const zve = { from: taxableIncome(provision.to), to: taxableIncome(provision.from) }

  const allowance = input.children * childTaxAllowance(input.year)
  const withAllowance = (z: number) => splittingTariff(Math.max(0, z - allowance), 0, input.year)
  const withBenefit = (z: number) => splittingTariff(z, 0, input.year)
  // Günstigerprüfung: the allowance only wins when it saves more tax than the Kindergeld paid out.
  const childAllowanceUsed = allowance > 0 && withBenefit(zve.to) - withAllowance(zve.to) > input.childBenefit
  const reductionEur = input.householdReductionEur ?? 0
  const reducedTariffTaxFor = (z: number) =>
    applyHouseholdTaxReduction(childAllowanceUsed ? withAllowance(z) : withBenefit(z), reductionEur)
  const incomeTaxFor = (z: number) =>
    childAllowanceUsed ? reducedTariffTaxFor(z) + input.childBenefit : reducedTariffTaxFor(z)
  const incomeTax = { from: incomeTaxFor(zve.from), to: incomeTaxFor(zve.to) }

  // Soli and Kirchensteuer are always measured on the tax after the child allowances (§ 3 Abs. 2 SolZG, § 51a EStG).
  const exemptionLimit = soliExemptionLimits(input.year as never).joint
  const soli = {
    from: solidaritaetszuschlag(withAllowance(zve.from), exemptionLimit),
    to: solidaritaetszuschlag(withAllowance(zve.to), exemptionLimit),
  }
  const churchTax = input.churchMember
    ? { from: Math.round(withAllowance(zve.from) * CHURCH_TAX_RATE.from), to: Math.round(withAllowance(zve.to) * CHURCH_TAX_RATE.to) }
    : { from: 0, to: 0 }
  const churchTaxOpen = input.churchMember && [input.a, input.b].some((s) => s?.kind === 'employee')
  const churchTaxDue = churchTaxOpen ? { from: 0, to: 0 } : churchTax

  const credit = spouses.reduce((sum, s) => sum + s.credit, 0)
  return {
    kind: 'spanne',
    werbungskosten: 0,
    provision,
    specialExpenses,
    taxableIncome: zve,
    incomeTax,
    solidaritaetszuschlag: soli,
    anrechnung: credit,
    result: {
      from: credit - incomeTax.to - soli.to - churchTaxDue.to,
      to: credit - incomeTax.from - soli.from - churchTaxDue.from,
    },
    childAllowanceUsed,
    churchTax,
    churchTaxOpen,
  }
}
