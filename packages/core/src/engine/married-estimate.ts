import type { EstimateChurchTax, Range, TaxEstimate } from './tax-estimate'
import { churchTaxMixedMarriage, churchTaxOnIncome, type ChurchMembership, type ChurchTaxAmount } from '../domains/church-tax'
import type { GermanState } from '../common/postal-codes'
import { incomeTax as basicTariff } from '../math/tarif'
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
  /** Kirchensteuer facts of both spouses; without them church tax stays out of the estimate. */
  readonly churchTax?: MarriedChurchTaxInput | undefined
  /** § 35a EStG joint tax reduction in EUR (optional, defaults to 0). */
  readonly householdReductionEur?: number | undefined
  /** § 33 EStG joint medical expenses in EUR (optional, defaults to 0). */
  readonly healthExpensesEur?: number | undefined
  /** Optional § 33 Abs. 3 children bracket override when count distinguishes 2 from 3+ elsewhere. */
  readonly childrenBracket?: BurdenChildrenBracket | undefined
}

export interface SpouseChurchTax {
  readonly membership: ChurchMembership
  /** LStB Zeilen 6 + 7 of this spouse; null = not entered (ignored for a Grenzgänger: nothing withheld in DE). */
  readonly withheld: number | null
}

export interface MarriedChurchTaxInput {
  /** Shared residence of the couple. */
  readonly state: GermanState | null
  readonly postalCode: string | null
  readonly a: SpouseChurchTax
  readonly b: SpouseChurchTax
}

export type MarriedEstimate =
  | (Omit<Extract<TaxEstimate, { kind: 'spanne' }>, 'churchTax'> & {
      readonly childAllowanceUsed: boolean
      readonly churchTax: EstimateChurchTax
    })
  | { readonly kind: 'nicht-moeglich'; readonly reason: 'jahr-ohne-tarif' }

/** Deductible share of German employee social security (see steuerschaetzung.ts). */
const SOCIAL_SECURITY_DEDUCTIBLE: Range = { from: 0.91, to: 0.93 }

interface SpouseFigures {
  /** The larger of the lump sum and the commute allowance, deducted from the wage. */
  readonly werbungskosten: number
  readonly income: number
  readonly provision: Range
  readonly credit: number
}

function spouseFigures(s: SpouseIncome, year: number): SpouseFigures {
  const params = getTaxYearParameters(year)
  if (s.kind === 'employee') {
    const werbungskosten = Math.max(params.lumpSums.employee, s.commuteAllowance)
    return {
      werbungskosten,
      income: s.grossWage - werbungskosten,
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
  const werbungskosten = Math.max(params.lumpSums.employee, s.commuteAllowance)
  return {
    werbungskosten,
    income: s.wageEur - werbungskosten,
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
  // § 10 Abs. 1 Nr. 4 EStG: the church tax withheld in the year is a Sonderausgabe.
  const withheld = withheldChurchTax(input)
  const specialExpenses = Math.max(params.lumpSums.specialExpensesJoint, input.donations + (withheld ?? 0))
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
  const churchBasis = (z: number) => applyHouseholdTaxReduction(withAllowance(z), reductionEur)
  const churchTax = coupleChurchTax(input, spouses, {
    basis: { from: churchBasis(zve.from), to: churchBasis(zve.to) },
    zvE: zve,
    kirchgeldBase: { from: Math.max(0, zve.from - allowance), to: Math.max(0, zve.to - allowance) },
    withheld,
  })
  const churchBalance =
    churchTax.kind === 'spanne'
      ? { from: churchTax.withheld - churchTax.due.to, to: churchTax.withheld - churchTax.due.from }
      : { from: 0, to: 0 }

  const credit = spouses.reduce((sum, s) => sum + s.credit, 0)
  return {
    kind: 'spanne',
    // What was deducted for both spouses together; it was a fixed 0 before (real-case test).
    werbungskosten: spouses.reduce((sum, s) => sum + s.werbungskosten, 0),
    provision,
    specialExpenses,
    taxableIncome: zve,
    incomeTax,
    solidaritaetszuschlag: soli,
    anrechnung: credit,
    result: {
      from: credit - incomeTax.to - soli.to + churchBalance.from,
      to: credit - incomeTax.from - soli.from + churchBalance.to,
    },
    childAllowanceUsed,
    churchTax,
  }
}

/** Church tax withheld from both spouses' wages (LStB Zeilen 6 + 7); null when a member employee has not entered it. */
function withheldChurchTax(input: MarriedEstimateInput): number | null {
  const church = input.churchTax
  if (!church) return 0
  let sum = 0
  for (const [income, facts] of [
    [input.a, church.a],
    [input.b, church.b],
  ] as const) {
    if (income?.kind !== 'employee') continue
    if (facts.withheld === null) {
      if (facts.membership.kind === 'member') return null
      continue
    }
    sum += facts.withheld
  }
  return sum
}

function toEstimate(amount: ChurchTaxAmount, withheld: number | null): EstimateChurchTax {
  if (amount.kind !== 'spanne') return amount
  if (withheld === null) return { kind: 'offen', reason: 'einbehalt-fehlt' }
  return { kind: 'spanne', due: amount.due, withheld, capOnApplication: amount.capOnApplication }
}

/**
 * Both members: church tax on the joint tax (konfessionsverschieden: the same total, split halbteilig
 * between the churches). One member: church tax on the member's share, compared with the besonderes
 * Kirchgeld (glaubensverschieden). Shares follow the tax each spouse would pay on their own income.
 */
function coupleChurchTax(
  input: MarriedEstimateInput,
  spouses: readonly SpouseFigures[],
  amounts: { readonly basis: Range; readonly zvE: Range; readonly kirchgeldBase: Range; readonly withheld: number | null },
): EstimateChurchTax {
  const church = input.churchTax
  if (!church) return { kind: 'none' }
  const { a, b } = church
  if (a.membership.kind === 'unknown' || b.membership.kind === 'unknown') return { kind: 'offen', reason: 'konfession-fehlt' }
  if (a.membership.kind === 'none' && b.membership.kind === 'none') return { kind: 'none' }
  const common = { year: input.year, state: church.state, postalCode: church.postalCode, basis: amounts.basis, zvE: amounts.zvE }
  if (a.membership.kind === 'member' && b.membership.kind === 'member') {
    const forA = churchTaxOnIncome({ ...common, membership: a.membership })
    const forB = churchTaxOnIncome({ ...common, membership: b.membership })
    if (forA.kind !== 'spanne') return toEstimate(forA, amounts.withheld)
    if (forB.kind !== 'spanne') return toEstimate(forB, amounts.withheld)
    return toEstimate(
      {
        kind: 'spanne',
        due: { from: Math.min(forA.due.from, forB.due.from), to: Math.max(forA.due.to, forB.due.to) },
        capOnApplication: forA.capOnApplication || forB.capOnApplication,
      },
      amounts.withheld,
    )
  }
  const memberIsA = a.membership.kind === 'member'
  const membership = memberIsA ? a.membership : b.membership
  const ownTax = (index: number) => basicTariff(Math.max(0, spouses[index]?.income ?? 0), input.year as never)
  const taxA = ownTax(0)
  const taxB = ownTax(1)
  const share = taxA + taxB === 0 ? 0.5 : (memberIsA ? taxA : taxB) / (taxA + taxB)
  return toEstimate(
    churchTaxMixedMarriage({ ...common, membership, memberShare: { from: share, to: share }, kirchgeldBase: amounts.kirchgeldBase }),
    amounts.withheld,
  )
}
