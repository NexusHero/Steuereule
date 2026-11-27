import { roundToCents } from '../common/cents'
import type { TaxEstimate } from './tax-estimate'
import type { Range } from '../common/range'
import { churchTaxMixedMarriage, churchTaxOnIncome, type ChurchMembership, type ChurchTaxAmount, type EstimateChurchTax } from '../domains/church-tax'
import type { GermanState } from '../common/postal-codes'
import { incomeTax as basicTariff } from '../math/tarif'
import { childTaxAllowance } from '../domains/children'
import { applyHouseholdTaxReduction } from '../domains/household-services'
import { calculateExtraordinaryBurden, type BurdenChildrenBracket } from '../domains/extraordinary-burdens'
import { withSpecialTariffs, type SpecialTariffFacts } from '../domains/business/special-tariffs'
import { capitalFlatTax, isSupportedIncomeTaxYear, progressionClauseTax, soliExemptionLimits, soliOnFlatTax, solidaritaetszuschlag, solidaritaetszuschlagInCents, splittingTariff } from '../math/tarif'
import { getTaxYearParameters } from '../math/tax-parameters'
import { deductibleProvision, type ChildrenProvision, type PersonProvision } from '../domains/provision'
import { afterTradeTaxCredit, businessTotal, creditPerson, lossesOfYear, type BusinessIncome, type LossCarry, type Prepayments } from './business-income'

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
      /** The provision line by line; with it for every spouse the deduction is exact instead of a range (ADR-0094). */
      readonly provision?: PersonProvision | undefined
      /** Solidaritätszuschlag withheld with the wage tax (LStB Zeile 5); absent = derived from the wage tax. */
      readonly soliWithheldEur?: number | undefined
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
      /** The provision line by line; with it for every spouse the deduction is exact instead of a range (ADR-0094). */
      readonly provision?: PersonProvision | undefined
    }
  | {
      /**
       * A year with both: a German employer with a Lohnsteuerbescheinigung and a Swiss one as a
       * Grenzgänger (a change of job). One Arbeitnehmer-Pauschbetrag, both credits (ADR-0079).
       */
      readonly kind: 'mixed'
      readonly grossWage: number
      readonly wageTax: number
      readonly socialSecurity: number
      readonly wageEur: number
      readonly swissWithholdingEur: number
      readonly pensionContributionsEur: number
      readonly otherProvisionEur: number
      readonly commuteAllowance: number
      readonly selfPaidHealthCare: number
      /** The provision line by line; with it for every spouse the deduction is exact instead of a range (ADR-0094). */
      readonly provision?: PersonProvision | undefined
      /** Solidaritätszuschlag withheld with the wage tax (LStB Zeile 5); absent = derived from the wage tax. */
      readonly soliWithheldEur?: number | undefined
    }
  | {
      /** A pension (Anlage R): its taxable share (Besteuerungs- or Ertragsanteil); nothing is withheld (ADR-0088). */
      readonly kind: 'pension'
      readonly taxablePensionEur: number
    }
  | {
      /**
       * No wage and no pension: a spouse who lives on the business (`MarriedEstimateInput.business`),
       * with the provision paid outside a wage (ADR-0101).
       */
      readonly kind: 'selfEmployed'
      readonly provision: PersonProvision
    }

/** § 9a S. 1 Nr. 3 EStG: Werbungskosten-Pauschbetrag for pensions. */
const PENSION_LUMP_SUM_EUR = 102

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
  /** Wage replacement benefits of both spouses under the progression clause (§ 32b EStG). */
  readonly wageReplacementEur?: number | undefined
  /** The child allowances of the year when they differ from the full amount per child (a child born in the year). */
  readonly childAllowanceEur?: number | undefined
  /** Insurance paid for the children (Anlage Kind); counts only in the exact deduction. */
  readonly childrenProvision?: ChildrenProvision | undefined
  /**
   * Capital income taxed with the return at the flat rate (§ 32d Abs. 1 EStG): what is left after the
   * Sparer-Pauschbetrag and was not taxed at source (above the Freistellungsauftrag, a foreign bank).
   */
  readonly capitalIncomeEur?: number | undefined
  /** Kapitalertragsteuer and Soli the banks withheld on that income: credited like the wage tax. */
  readonly capitalTaxWithheldEur?: number | undefined
  /** Gewinneinkünfte of each spouse (Anlage S and G), beside or instead of the wage (ADR-0101). */
  readonly business?: { readonly a?: BusinessIncome | undefined; readonly b?: BusinessIncome | undefined } | undefined
  /** § 10d EStG of the couple: the joint Verlustvortrag and Rücktrag (doubled limits). */
  readonly losses?: LossCarry | undefined
  /** Income tax and Soli prepaid by Vorauszahlungsbescheid. */
  readonly prepayments?: Prepayments | undefined
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
  /** The person's wages and the wage tax credited without Soli (Bescheid's „Anrechnung“); absent without a wage. */
  readonly wage?: { readonly grossEur: number; readonly wageTaxEur: number }
  /** The provision lines when the caller gave them; null for a pension, which has none. */
  readonly detail: PersonProvision | null | undefined
}

function spouseFigures(s: SpouseIncome, year: number): SpouseFigures {
  const params = getTaxYearParameters(year)
  if (s.kind === 'selfEmployed') {
    const deduction = deductibleProvision(year, [s.provision]).totalEur
    return { werbungskosten: 0, income: 0, provision: { from: deduction, to: deduction }, credit: 0, detail: s.provision }
  }
  if (s.kind === 'pension') {
    const werbungskosten = Math.min(PENSION_LUMP_SUM_EUR, s.taxablePensionEur)
    return { werbungskosten, income: s.taxablePensionEur - werbungskosten, provision: { from: 0, to: 0 }, credit: 0, detail: null }
  }
  if (s.kind === 'employee') {
    const werbungskosten = Math.max(params.lumpSums.employee, s.commuteAllowance)
    return {
      werbungskosten,
      income: s.grossWage - werbungskosten,
      provision: {
        from: Math.round(s.socialSecurity * SOCIAL_SECURITY_DEDUCTIBLE.from) + s.selfPaidHealthCare,
        to: Math.round(s.socialSecurity * SOCIAL_SECURITY_DEDUCTIBLE.to) + s.selfPaidHealthCare,
      },
      credit: s.wageTax + (s.soliWithheldEur ?? solidaritaetszuschlag(s.wageTax, soliExemptionLimits(year as never).single)),
      wage: { grossEur: s.grossWage, wageTaxEur: s.wageTax },
      detail: s.provision,
    }
  }
  const other = Math.max(
    s.selfPaidHealthCare,
    Math.min(params.maxOtherProvisionEur, s.selfPaidHealthCare + s.otherProvisionEur),
  )
  const werbungskosten = Math.max(params.lumpSums.employee, s.commuteAllowance)
  if (s.kind === 'mixed') {
    return {
      werbungskosten,
      income: s.grossWage + s.wageEur - werbungskosten,
      provision: {
        from: Math.round(s.socialSecurity * SOCIAL_SECURITY_DEDUCTIBLE.from) + s.pensionContributionsEur + s.selfPaidHealthCare,
        to: Math.round(s.socialSecurity * SOCIAL_SECURITY_DEDUCTIBLE.to) + s.pensionContributionsEur + other,
      },
      credit: s.wageTax + (s.soliWithheldEur ?? solidaritaetszuschlag(s.wageTax, soliExemptionLimits(year as never).single)) + s.swissWithholdingEur,
      wage: { grossEur: s.grossWage + s.wageEur, wageTaxEur: s.wageTax + s.swissWithholdingEur },
      detail: s.provision,
    }
  }
  return {
    werbungskosten,
    income: s.wageEur - werbungskosten,
    provision: { from: s.pensionContributionsEur + s.selfPaidHealthCare, to: s.pensionContributionsEur + other },
    credit: s.swissWithholdingEur,
    wage: { grossEur: s.wageEur, wageTaxEur: s.swissWithholdingEur },
    detail: s.provision,
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
  const businessA = input.business?.a
  const businessB = input.business?.b
  const income = spouses.reduce((sum, s) => sum + s.income, 0) + input.rentalSurplus + businessTotal(businessA) + businessTotal(businessB)
  const gdeEur = Math.max(0, income)
  const losses = lossesOfYear(input.year, true, income, input.losses)
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
  // With the lines of every spouse the deduction is the one on the notice; otherwise the range (ADR-0094).
  const details = spouses.map((s) => s.detail).filter((d) => d !== null)
  const provisionLines = details.length > 0 && details.every((d) => d !== undefined) ? deductibleProvision(input.year, details as PersonProvision[], input.childrenProvision) : null
  const exact = provisionLines?.totalEur ?? null
  const provision =
    exact !== null
      ? { from: exact, to: exact }
      : {
          from: spouses.reduce((sum, s) => sum + s.provision.from, 0),
          to: spouses.reduce((sum, s) => sum + s.provision.to, 0),
        }
  // § 10 Abs. 1 Nr. 4 EStG: the church tax withheld in the year is a Sonderausgabe.
  const withheld = withheldChurchTax(input)
  const specialExpenses = Math.max(params.lumpSums.specialExpensesJoint, input.donations + (withheld ?? 0))
  const taxableIncome = (deduction: number) => Math.max(0, losses.gdeAfterLossesEur - deduction - specialExpenses - deductibleBurdenEur)
  const zve = { from: taxableIncome(provision.to), to: taxableIncome(provision.from) }

  const allowance = input.childAllowanceEur ?? input.children * childTaxAllowance(input.year)
  // § 32b EStG: wage replacement benefits raise the rate on the splitting tariff as for a single person.
  const progression = Math.max(0, Math.floor(input.wageReplacementEur ?? 0))
  // § 34 / § 34a parts of either spouse come out of the splitting tariff (ADR-0101 §22).
  const tariff = withSpecialTariffs(
    (z: number) => (progression > 0 ? progressionClauseTax(z, progression, input.year, true) : splittingTariff(z, 0, input.year)),
    mergedSpecial(businessA?.special, businessB?.special),
  )
  const withAllowance = (z: number) => tariff(Math.max(0, z - allowance))
  const withBenefit = (z: number) => tariff(z)
  // Günstigerprüfung: the allowance only wins when it saves more tax than the Kindergeld paid out.
  const childAllowanceUsed = allowance > 0 && withBenefit(zve.to) - withAllowance(zve.to) > input.childBenefit
  const reductionEur = input.householdReductionEur ?? 0
  // § 35 EStG per spouse (BMF 3.11.2016 Rn. 10, 16); the rental surplus is not split, so it counts as A's.
  const persons = [creditPerson(businessA, [spouses[0]?.income ?? 0, input.rentalSurplus]), creditPerson(businessB, [spouses[1]?.income ?? 0])]
  const afterCredit = (tax: number) => afterTradeTaxCredit(persons, tax)
  const reducedTariffTaxFor = (z: number) =>
    applyHouseholdTaxReduction(afterCredit(childAllowanceUsed ? withAllowance(z) : withBenefit(z)).taxEur, reductionEur)
  // § 32d Abs. 1 EStG: capital income not taxed at source bears the flat rate on top of the tariff.
  const flatTax = capitalFlatTax(input.capitalIncomeEur ?? 0, input.year)
  const incomeTaxFor = (z: number) =>
    (childAllowanceUsed ? reducedTariffTaxFor(z) + input.childBenefit : reducedTariffTaxFor(z)) + flatTax
  const incomeTax = { from: incomeTaxFor(zve.from), to: incomeTaxFor(zve.to) }

  // Soli and Kirchensteuer are always measured on the tax after the child allowances (§ 3 Abs. 2 SolZG, § 51a EStG).
  const exemptionLimit = soliExemptionLimits(input.year as never).joint
  // On the tax after the reductions (§ 3 Abs. 1 Nr. 1 SolZG), to the cent as on the notice; the Soli on
  // the flat tax knows no exemption limit (§ 3 Abs. 3 SolZG).
  // Church tax ignores the § 35 credit (§ 51a Abs. 2 Satz 3 EStG); the Soli takes the tax after it (§ 3 Abs. 2 SolZG).
  const churchBasis = (z: number) => applyHouseholdTaxReduction(withAllowance(z), reductionEur)
  const soliBasis = (z: number) => applyHouseholdTaxReduction(afterCredit(withAllowance(z)).taxEur, reductionEur)
  const soliFor = (z: number) => (solidaritaetszuschlagInCents(soliBasis(z), exemptionLimit) + soliOnFlatTax(flatTax)) / 100
  const soli = { from: soliFor(zve.from), to: soliFor(zve.to) }
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

  const prepaidSoli = input.prepayments?.soliEur ?? 0
  const credit = spouses.reduce((sum, s) => sum + s.credit, 0) + (input.capitalTaxWithheldEur ?? 0) + (input.prepayments?.incomeTaxEur ?? 0)
  const withBusiness = input.business !== undefined || input.losses !== undefined || input.prepayments !== undefined
  const tariffAt = (z: number) => (childAllowanceUsed ? withAllowance(z) : withBenefit(z))
  return {
    kind: 'spanne',
    // What was deducted for both spouses together; it was a fixed 0 before (real-case test).
    werbungskosten: spouses.reduce((sum, s) => sum + s.werbungskosten, 0),
    provision,
    specialExpenses,
    // As on the notice: the zvE is after the child allowances when they win over the Kindergeld (§ 2 Abs. 5 EStG).
    taxableIncome: childAllowanceUsed ? { from: Math.max(0, zve.from - allowance), to: Math.max(0, zve.to - allowance) } : zve,
    incomeTax,
    solidaritaetszuschlag: soli,
    anrechnung: credit,
    result: {
      from: roundToCents(credit + prepaidSoli - incomeTax.to - soli.to + churchBalance.from),
      to: roundToCents(credit + prepaidSoli - incomeTax.from - soli.from + churchBalance.to),
    },
    childAllowanceUsed,
    churchTax,
    breakdown: {
      persons: spouses.map((s) => ({ incomeEur: s.income, workExpensesEur: s.werbungskosten, creditedTaxEur: s.credit, ...(s.wage ? { grossWageEur: s.wage.grossEur, wageTaxEur: s.wage.wageTaxEur } : {}) })),
      ...(input.rentalSurplus !== 0 ? { rentalSurplusEur: input.rentalSurplus } : {}),
      totalIncomeEur: income,
      ...(provisionLines ? { provision: provisionLines } : {}),
      extraordinaryBurdenEur: deductibleBurdenEur,
      childAllowance: { allowanceEur: allowance, childBenefitEur: input.childBenefit, used: childAllowanceUsed },
      tariffTax: { from: tariffAt(zve.from), to: tariffAt(zve.to) },
      householdReductionEur: afterCredit(tariffAt(zve.to)).taxEur - reducedTariffTaxFor(zve.to),
      ...(flatTax > 0 ? { capitalFlatTaxEur: flatTax } : {}),
      ...(progression > 0 ? { progressionIncomeEur: progression } : {}),
    },
    ...(withBusiness
      ? {
          business: {
            selfEmployedEur: (businessA?.selfEmployedEur ?? 0) + (businessB?.selfEmployedEur ?? 0),
            tradeEur: (businessA?.tradeEur ?? 0) + (businessB?.tradeEur ?? 0),
            gdeEur: income,
            losses,
            tradeTaxCredit: { from: afterCredit(tariffAt(zve.from)).creditEur, to: afterCredit(tariffAt(zve.to)).creditEur },
          },
        }
      : {}),
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

/**
 * The special tariffs of a couple: the retained profits add up. Of the § 16 gains one takes the reduced
 * rate (the largest that asks for it; the tariff models one per year), every other the Fünftelregelung.
 */
function mergedSpecial(a: SpecialTariffFacts | undefined, b: SpecialTariffFacts | undefined): SpecialTariffFacts | undefined {
  if (!a && !b) return undefined
  const gains = [a?.extraordinary, b?.extraordinary].filter((x): x is NonNullable<typeof x> => x !== undefined)
  const retained = [a?.retained, b?.retained].filter((x): x is NonNullable<typeof x> => x !== undefined)
  return {
    ...(gains.length > 0 ? { extraordinary: coupleGains(gains) } : {}),
    ...(retained.length > 0
      ? { retained: { favouredEur: retained.reduce((s, r) => s + r.favouredEur, 0), taxEur: retained.reduce((s, r) => s + r.taxEur, 0), recaptureEur: retained.reduce((s, r) => s + r.recaptureEur, 0) } }
      : {}),
  }
}

function coupleGains(gains: readonly NonNullable<SpecialTariffFacts['extraordinary']>[]): NonNullable<SpecialTariffFacts['extraordinary']> {
  const total = gains.reduce((s, g) => s + g.gainEur + (g.fifthGainEur ?? 0), 0)
  const reduced = gains.filter((g) => g.method === 'ermaessigt').sort((a, b) => b.gainEur - a.gainEur)[0]
  if (!reduced) return { gainEur: total, method: 'fuenftel' }
  const rest = total - reduced.gainEur
  return { gainEur: reduced.gainEur, method: 'ermaessigt', ...(rest > 0 ? { fifthGainEur: rest } : {}) }
}
