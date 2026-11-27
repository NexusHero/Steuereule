import { roundToCents } from '../common/cents'
import { incomeTax, isSupportedIncomeTaxYear, progressionClauseTax, soliExemptionLimits, solidaritaetszuschlag } from '../math/tarif'
import { getTaxYearParameters } from '../math/tax-parameters'
import { applyHouseholdTaxReduction } from '../domains/household-services'
import { calculateExtraordinaryBurden, type BurdenChildrenBracket } from '../domains/extraordinary-burdens'
import { churchTaxOnIncome, type ChurchMembership, type EstimateChurchTax } from '../domains/church-tax'
import { childTaxAllowance } from '../domains/children'
import type { GermanState } from '../common/postal-codes'
import type { Range } from '../common/range'
import { deductibleProvision, type PersonProvision, type ProvisionDeduction } from '../domains/provision'
import { withSpecialTariffs } from '../domains/business/special-tariffs'
import { afterTradeTaxCredit, businessTotal, creditPerson, lossesOfYear, type BusinessEstimate, type BusinessIncome, type LossCarry, type Prepayments } from './business-income'

/** What the estimate needs to know about the church tax of one person. */
export interface ChurchTaxInput {
  readonly membership: ChurchMembership
  /** Bundesland of residence (from the PLZ in the master data); null = unknown → rate 8–9 %. */
  readonly state: GermanState | null
  readonly postalCode: string | null
  /** LStB Zeilen 6 + 7; null = not entered yet. */
  readonly withheld: number | null
  /** Children with a Kinderfreibetrag — § 51a Abs. 2 EStG measures the church tax after them. */
  readonly children: number
}

/**
 * The steps behind an estimate (ADR-0052 amendment 3): what each person earned after Werbungskosten, how
 * the provision is made up, and how the tariff tax becomes the income tax of the result. Where the
 * estimate is a range, these are the ends of the same range.
 */
export interface EstimateBreakdown {
  /** Einkünfte aus nichtselbständiger Arbeit or pension per person (A first), after Werbungskosten. */
  readonly persons?: readonly { readonly incomeEur: number; readonly workExpensesEur: number; readonly creditedTaxEur: number }[]
  readonly rentalSurplusEur?: number
  /** Summe der Einkünfte, before losses, provision and Sonderausgaben. */
  readonly totalIncomeEur: number
  /** The lines of the Vorsorge deduction, when every person's lines are known (ADR-0094). */
  readonly provision?: ProvisionDeduction
  /** § 33 EStG: what is deducted after the zumutbare Belastung. */
  readonly extraordinaryBurdenEur: number
  /** Günstigerprüfung § 31 EStG: the allowance wins only when it saves more than the Kindergeld. */
  readonly childAllowance?: { readonly allowanceEur: number; readonly childBenefitEur: number; readonly used: boolean }
  /** Tariff tax on the taxable income (after the child allowance when it is used), before reductions. */
  readonly tariffTax: Range
  /** § 35a EStG, as far as it reduced the tax. */
  readonly householdReductionEur: number
  /** § 32d Abs. 1 EStG: flat tax on capital income not taxed at source, part of the income tax. */
  readonly capitalFlatTaxEur?: number
  /** § 32b EStG: the tax-free income that raised the rate of the tariff above; absent when none. */
  readonly progressionIncomeEur?: number
}

export type TaxEstimate =
  | {
      readonly kind: 'spanne'
      readonly werbungskosten: number
      readonly provision: Range
      readonly specialExpenses: number
      readonly taxableIncome: Range
      readonly incomeTax: Range
      readonly solidaritaetszuschlag: Range
      readonly anrechnung: number
      /** Positive = Erstattung, negative = Nachzahlung. */
      readonly result: Range
      /** Present when the caller passed the church tax facts. */
      readonly churchTax?: EstimateChurchTax
      /** Present when the caller passed Gewinneinkünfte, losses or prepayments (ADR-0101). */
      readonly business?: BusinessEstimate
      /** How the figures above come about; for explaining the estimate, never a second calculation. */
      readonly breakdown?: EstimateBreakdown
    }
  | { readonly kind: 'nicht-moeglich'; readonly reason: 'jahr-ohne-tarif' }

export interface EmployeeEstimateInput {
  readonly year: number
  readonly bruttoarbeitslohn: number
  readonly lohnsteuer: number
  readonly sozialversicherung: number
  readonly commuterAllowance: number
  readonly otherIncomeRelatedExpenses: number
  readonly donations: number
  readonly selfPaidKvPv: number
  /** § 35a EStG tax reduction in EUR (optional, defaults to 0). */
  readonly householdReductionEur?: number | undefined
  /** § 33 EStG self-paid medical expenses in EUR (optional, defaults to 0). */
  readonly healthExpensesEur?: number | undefined
  /** § 24b EStG: single parent — the Entlastungsbetrag lowers the taxable income (and the GdE for § 33). */
  readonly singleParent?: boolean | undefined
  /** § 24b Abs. 2 Satz 2 EStG: children the relief counts (240 € more for each beyond the first; default 1). */
  readonly singleParentChildren?: number | undefined
  /** § 33 Abs. 3 EStG children bracket (defaults to '0'). */
  readonly childrenBracket?: BurdenChildrenBracket | undefined
  /** Kirchensteuer facts; without them the estimate leaves church tax out (as before #450 6F). */
  readonly churchTax?: ChurchTaxInput | undefined
  /** Wage replacement benefits (Kurzarbeit-, Eltern-, Krankengeld …): tax-free, but under the progression clause (§ 32b EStG). */
  readonly wageReplacementEur?: number | undefined
  /** Gewinneinkünfte beside the main income (ADR-0101). */
  readonly business?: BusinessIncome | undefined
  /** § 10d EStG: Verlustvortrag and Rücktrag of the year. */
  readonly losses?: LossCarry | undefined
  /** Income tax and Soli prepaid by Vorauszahlungsbescheid. */
  readonly prepayments?: Prepayments | undefined
}

/** The EUR lines of the Anlage N-Gre (anlageNGreBetraege) plus what the user pays outside the salary. */
export interface CrossBorderEstimateInput {
  readonly year: number
  /**
   * Wages of the same year from a German employer (Lohnsteuerbescheinigung), when the person changed to
   * a Swiss employer during the year (ADR-0079): added to the income, the provision and the credit.
   */
  readonly germanWage?: { readonly gross: number; readonly wageTax: number; readonly socialSecurity: number } | undefined
  /** Z. 23: Arbeitslohn after Familienzulagen. */
  readonly wageEur: number
  /** Z. 25: creditable Swiss withholding tax, at most 4.5 %. */
  readonly withholdingTaxEur: number
  /** Z. 85: employee AHV/IV plus Pensionskasse Obligatorium — treated like gesetzliche Rentenversicherung. */
  readonly retirementProvisionEur: number
  /** Z. 82: EO, ALV, Krankentaggeld and half the NBUV — sonstige Vorsorgeaufwendungen. */
  readonly otherProvisionEur: number
  /** Basic health and care insurance paid outside the salary (Swiss Krankenkasse, German KV/PV). */
  readonly healthInsuranceEur: number
  readonly commuterAllowance: number
  readonly donations: number
  /** § 35a EStG tax reduction in EUR (optional, defaults to 0). */
  readonly householdReductionEur?: number | undefined
  /** § 33 EStG self-paid medical expenses in EUR (optional, defaults to 0). */
  readonly healthExpensesEur?: number | undefined
  /** § 24b EStG: single parent — the Entlastungsbetrag lowers the taxable income (and the GdE for § 33). */
  readonly singleParent?: boolean | undefined
  /** § 24b Abs. 2 Satz 2 EStG: children the relief counts (240 € more for each beyond the first; default 1). */
  readonly singleParentChildren?: number | undefined
  /** § 33 Abs. 3 EStG children bracket (defaults to '0'). */
  readonly childrenBracket?: BurdenChildrenBracket | undefined
  /** Kirchensteuer facts; a Grenzgänger CH has no German church tax withheld (`withheld` is ignored). */
  readonly churchTax?: Omit<ChurchTaxInput, 'withheld'> | undefined
  /** Wage replacement benefits under the progression clause (§ 32b EStG). */
  readonly wageReplacementEur?: number | undefined
  /** Gewinneinkünfte beside the main income (ADR-0101). */
  readonly business?: BusinessIncome | undefined
  /** § 10d EStG: Verlustvortrag and Rücktrag of the year. */
  readonly losses?: LossCarry | undefined
  /** Income tax and Soli prepaid by Vorauszahlungsbescheid. */
  readonly prepayments?: Prepayments | undefined
}

/** What a single pensioner's estimate needs (Anlage R, UX review K3). */
export interface PensionerEstimateInput {
  readonly year: number
  /** Gross annual pension — the statutory health and care insurance of pensioners is measured on it. */
  readonly grossPensionEur: number
  /** Taxable share (Besteuerungs- or Ertragsanteil, § 22 Nr. 1 Satz 3 Buchst. a EStG). */
  readonly taxablePensionEur: number
  readonly donations: number
  /** Health and care contributions paid outside the pension (Sonderausgaben catalogue). */
  readonly selfPaidKvPv: number
  /** Privately insured: the self-paid contributions replace the statutory share deducted from the pension. */
  readonly privatelyInsured?: boolean | undefined
  /**
   * A pensioner with a business (ADR-0101 §22): own pension contributions (Basisrente, Versorgungswerk,
   * statutory RV) and other insurance, under the caps of § 10 Abs. 3 and 4 EStG.
   */
  readonly ownProvision?: { readonly pensionEur: number; readonly otherEur: number } | undefined
  readonly householdReductionEur?: number | undefined
  readonly healthExpensesEur?: number | undefined
  readonly childrenBracket?: BurdenChildrenBracket | undefined
  /** Church tax is not withheld from a pension: `withheld` counts as 0. */
  readonly churchTax?: Omit<ChurchTaxInput, 'withheld'> | undefined
  /** Gewinneinkünfte beside the main income (ADR-0101). */
  readonly business?: BusinessIncome | undefined
  /** § 10d EStG: Verlustvortrag and Rücktrag of the year. */
  readonly losses?: LossCarry | undefined
  /** Income tax and Soli prepaid by Vorauszahlungsbescheid. */
  readonly prepayments?: Prepayments | undefined
}

/**
 * Share of the gross pension a statutory insured pensioner pays for health and care insurance (KVdR):
 * half of 14.6 % plus half the average Zusatzbeitrag, and the full care rate (3.6 % with, 4.2 % without
 * children, plus later reductions for more children) — roughly 11 to 13 %, all of it deductible
 * because a pension carries no Krankengeld claim (§ 10 Abs. 1 Nr. 3 EStG).
 */
export const STATUTORY_PENSIONER_HEALTH_SHARE: Range = { from: 0.11, to: 0.13 }

/** § 9a Satz 1 Nr. 3 EStG: Werbungskosten-Pauschbetrag for pensions. */
const PENSION_LUMP_SUM_EUR = 102

/**
 * The part of the wage replacement benefits the progression clause counts (§ 32b Abs. 2 Satz 1 Nr. 1
 * Buchst. a EStG): the benefits less the Arbeitnehmer-Pauschbetrag as far as the wage did not use it.
 * When the actual Werbungskosten beat the lump sum, the wage deducts those and the whole lump sum is
 * left for the benefits (BFH III R 61/12); otherwise the wage uses the lump sum up to its own amount.
 */
function progressionIncome(benefits: number | undefined, wages: number, actualWorkExpenses: number, employeeLumpSum: number): number {
  if (benefits === undefined || !Number.isFinite(benefits) || benefits <= 0) return 0
  const unusedLumpSum = actualWorkExpenses > employeeLumpSum ? employeeLumpSum : Math.max(0, employeeLumpSum - Math.max(0, wages))
  return Math.max(0, Math.floor(benefits) - unusedLumpSum)
}

/**
 * Deductible share of the employee's social security contributions (RV fully, KV less 4 % for Krankengeld, PV
 * fully, AV absorbed by the Höchstbetrag): 91–93 % depending on Zusatzbeitrag and Kinderlosenzuschlag.
 */
const SV_DEDUCTIBLE: Range = { from: 0.91, to: 0.93 }

/** A ranged estimate of the Einkommensteuer for one single Angestellte — never a point value (product ADR-015). */
export function taxEstimateEmployee(e: EmployeeEstimateInput): TaxEstimate {
  if (!isSupportedIncomeTaxYear(e.year)) return { kind: 'nicht-moeglich', reason: 'jahr-ohne-tarif' }
  const params = getTaxYearParameters(e.year)
  const provision = {
    from: Math.round(e.sozialversicherung * SV_DEDUCTIBLE.from) + e.selfPaidKvPv,
    to: Math.round(e.sozialversicherung * SV_DEDUCTIBLE.to) + e.selfPaidKvPv,
  }
  const werbungskosten = Math.max(params.lumpSums.employee, e.commuterAllowance + e.otherIncomeRelatedExpenses)
  return estimate({
    year: e.year,
    einnahmen: e.bruttoarbeitslohn,
    werbungskosten,
    provision,
    donations: e.donations,
    alreadyPaid: (taxAmount) => e.lohnsteuer - taxAmount + soli(e.lohnsteuer, e.year),
    anrechnung: e.lohnsteuer,
    specialExpensesLumpSum: params.lumpSums.specialExpensesSingle,
    householdReductionEur: e.householdReductionEur,
    healthExpensesEur: e.healthExpensesEur,
    singleParent: e.singleParent,
    singleParentChildren: e.singleParentChildren,
    childrenBracket: e.childrenBracket,
    churchTax: e.churchTax,
    progressionIncomeEur: progressionIncome(e.wageReplacementEur, e.bruttoarbeitslohn, e.commuterAllowance + e.otherIncomeRelatedExpenses, params.lumpSums.employee),
    business: e.business,
    losses: e.losses,
    prepayments: e.prepayments,
  })
}

/** A ranged estimate for a Grenzgänger CH: German tax against the creditable Swiss withholding tax (Art. 15a DBA). */
export function taxEstimateCrossBorder(e: CrossBorderEstimateInput): TaxEstimate {
  if (!isSupportedIncomeTaxYear(e.year)) return { kind: 'nicht-moeglich', reason: 'jahr-ohne-tarif' }
  const params = getTaxYearParameters(e.year)
  const otherDeductible = Math.max(
    e.healthInsuranceEur,
    Math.min(params.maxOtherProvisionEur, e.healthInsuranceEur + e.otherProvisionEur),
  )
  const german = e.germanWage
  const provision = {
    from: e.retirementProvisionEur + e.healthInsuranceEur + (german ? Math.round(german.socialSecurity * SV_DEDUCTIBLE.from) : 0),
    to: e.retirementProvisionEur + otherDeductible + (german ? Math.round(german.socialSecurity * SV_DEDUCTIBLE.to) : 0),
  }
  const credited = e.withholdingTaxEur + (german?.wageTax ?? 0)
  return estimate({
    year: e.year,
    einnahmen: e.wageEur + (german?.gross ?? 0),
    werbungskosten: Math.max(params.lumpSums.employee, e.commuterAllowance),
    provision,
    donations: e.donations,
    alreadyPaid: (taxAmount) => credited - taxAmount + (german ? soli(german.wageTax, e.year) : 0),
    anrechnung: credited,
    specialExpensesLumpSum: params.lumpSums.specialExpensesSingle,
    householdReductionEur: e.householdReductionEur,
    healthExpensesEur: e.healthExpensesEur,
    singleParent: e.singleParent,
    singleParentChildren: e.singleParentChildren,
    childrenBracket: e.childrenBracket,
    churchTax: e.churchTax ? { ...e.churchTax, withheld: 0 } : undefined,
    progressionIncomeEur: progressionIncome(e.wageReplacementEur, e.wageEur + (german?.gross ?? 0), e.commuterAllowance, params.lumpSums.employee),
    business: e.business,
    losses: e.losses,
    prepayments: e.prepayments,
  })
}

/**
 * A ranged estimate for a single pensioner (Anlage R): the taxable share less the 102 € lump sum, the
 * health and care insurance as Vorsorge, and no tax withheld — so the result is 0 or a back payment.
 */
export function taxEstimatePensioner(e: PensionerEstimateInput): TaxEstimate {
  if (!isSupportedIncomeTaxYear(e.year)) return { kind: 'nicht-moeglich', reason: 'jahr-ohne-tarif' }
  const params = getTaxYearParameters(e.year)
  const basic = e.privatelyInsured
    ? { from: e.selfPaidKvPv, to: e.selfPaidKvPv }
    : {
        from: Math.round(e.grossPensionEur * STATUTORY_PENSIONER_HEALTH_SHARE.from) + e.selfPaidKvPv,
        to: Math.round(e.grossPensionEur * STATUTORY_PENSIONER_HEALTH_SHARE.to) + e.selfPaidKvPv,
      }
  const provision = e.ownProvision ? { from: withOwnProvision(e.year, basic.from, e.ownProvision), to: withOwnProvision(e.year, basic.to, e.ownProvision) } : basic
  return estimate({
    year: e.year,
    einnahmen: e.taxablePensionEur,
    werbungskosten: Math.min(PENSION_LUMP_SUM_EUR, e.taxablePensionEur),
    provision,
    donations: e.donations,
    alreadyPaid: (taxAmount) => -taxAmount,
    anrechnung: 0,
    specialExpensesLumpSum: params.lumpSums.specialExpensesSingle,
    householdReductionEur: e.householdReductionEur,
    healthExpensesEur: e.healthExpensesEur,
    childrenBracket: e.childrenBracket,
    churchTax: e.churchTax ? { ...e.churchTax, withheld: 0 } : undefined,
    business: e.business,
    losses: e.losses,
    prepayments: e.prepayments,
  })
}

/**
 * The basic health and care insurance plus a pensioner's own pension contributions and other insurance:
 * the pension under its Höchstbetrag, the other insurance only where the basic insurance leaves room
 * under the 1.900 € cap (§ 10 Abs. 4 Satz 2 EStG: the pension insurer pays half of the KVdR).
 */
function withOwnProvision(year: number, basicEur: number, own: { readonly pensionEur: number; readonly otherEur: number }): number {
  const d = deductibleProvision(year, [
    { pensionOwnEur: own.pensionEur, pensionEmployerEur: 0, healthBasicEur: basicEur, healthWithSickPayEur: 0, careEur: 0, employerSubsidyEur: 0, otherEur: own.otherEur, reducedOtherCap: true },
  ])
  return d.totalEur
}

/** A single self-employed person, with or without a side job (ADR-0101). */
export interface SelfEmployedEstimateInput {
  readonly year: number
  readonly business: BusinessIncome
  readonly losses?: LossCarry | undefined
  readonly prepayments?: Prepayments | undefined
  /** What the person paid for provision outside a wage (Anlage Vorsorgeaufwand), line by line. */
  readonly provision: PersonProvision
  /** A job beside the business: its Lohnsteuerbescheinigung and Werbungskosten. */
  readonly wage?:
    | {
        readonly gross: number
        readonly wageTax: number
        readonly socialSecurity: number
        /** Werbungskosten actually paid; below the Arbeitnehmer-Pauschbetrag that one counts. */
        readonly workExpensesEur: number
      }
    | undefined
  readonly donations: number
  readonly householdReductionEur?: number | undefined
  readonly healthExpensesEur?: number | undefined
  readonly singleParent?: boolean | undefined
  readonly singleParentChildren?: number | undefined
  readonly childrenBracket?: BurdenChildrenBracket | undefined
  /** No church tax is withheld from a profit; with a side job `withheld` is its LStB Zeilen 6 + 7. */
  readonly churchTax?: ChurchTaxInput | undefined
}

/**
 * A ranged estimate for a single self-employed person: profit of Anlage S and G, § 10d, tariff, § 35,
 * Soli on the tax after § 35 (§ 3 Abs. 2 SolZG), church tax on the tax before it (§ 51a Abs. 2 Satz 3).
 */
export function taxEstimateSelfEmployed(e: SelfEmployedEstimateInput): TaxEstimate {
  if (!isSupportedIncomeTaxYear(e.year)) return { kind: 'nicht-moeglich', reason: 'jahr-ohne-tarif' }
  const params = getTaxYearParameters(e.year)
  const own = deductibleProvision(e.year, [e.provision]).totalEur
  const wage = e.wage
  const provision = {
    from: own + (wage ? Math.round(wage.socialSecurity * SV_DEDUCTIBLE.from) : 0),
    to: own + (wage ? Math.round(wage.socialSecurity * SV_DEDUCTIBLE.to) : 0),
  }
  // § 9a Satz 2 EStG: the lump sum comes off only up to the wage, so it never makes a loss.
  const werbungskosten = wage ? (wage.workExpensesEur > params.lumpSums.employee ? wage.workExpensesEur : Math.min(params.lumpSums.employee, wage.gross)) : 0
  return estimate({
    year: e.year,
    einnahmen: wage?.gross ?? 0,
    werbungskosten,
    provision,
    donations: e.donations,
    alreadyPaid: (taxAmount) => (wage ? wage.wageTax + soli(wage.wageTax, e.year) : 0) - taxAmount,
    anrechnung: wage?.wageTax ?? 0,
    specialExpensesLumpSum: params.lumpSums.specialExpensesSingle,
    householdReductionEur: e.householdReductionEur,
    healthExpensesEur: e.healthExpensesEur,
    singleParent: e.singleParent,
    singleParentChildren: e.singleParentChildren,
    childrenBracket: e.childrenBracket,
    churchTax: e.churchTax ? { ...e.churchTax, withheld: wage ? e.churchTax.withheld : 0 } : undefined,
    business: e.business,
    losses: e.losses,
    prepayments: e.prepayments,
  })
}

function estimate(input: {
  readonly year: number
  readonly einnahmen: number
  readonly werbungskosten: number
  readonly provision: Range
  readonly donations: number
  readonly alreadyPaid: (incomeTaxAmount: number) => number
  readonly anrechnung: number
  readonly specialExpensesLumpSum: number
  readonly householdReductionEur?: number | undefined
  readonly healthExpensesEur?: number | undefined
  readonly singleParent?: boolean | undefined
  readonly singleParentChildren?: number | undefined
  readonly childrenBracket?: BurdenChildrenBracket | undefined
  readonly churchTax?: ChurchTaxInput | undefined
  /** Tax-free income under the progression clause (§ 32b EStG); 0 or absent = the plain tariff. */
  readonly progressionIncomeEur?: number | undefined
  readonly business?: BusinessIncome | undefined
  readonly losses?: LossCarry | undefined
  readonly prepayments?: Prepayments | undefined
}): TaxEstimate {
  const params = getTaxYearParameters(input.year)
  const furtherChildren = Math.max(0, Math.floor(input.singleParentChildren ?? 1) - 1)
  const singleParentRelief = input.singleParent
    ? params.children.singleParentReliefEur + furtherChildren * params.children.singleParentAdditionalChildEur
    : 0
  const otherIncome = input.einnahmen - input.werbungskosten
  const sumOfIncome = otherIncome + businessTotal(input.business)
  // The relief comes off a positive Summe der Einkünfte only, so it never enlarges a loss for § 10d.
  const gdeBeforeLosses = sumOfIncome - Math.min(singleParentRelief, Math.max(0, sumOfIncome))
  const gdeEur = Math.max(0, gdeBeforeLosses)
  const losses = lossesOfYear(input.year, false, gdeBeforeLosses, input.losses)
  const deductibleBurdenEur =
    (input.healthExpensesEur ?? 0) > 0
      ? Math.round(
          calculateExtraordinaryBurden({
            year: input.year,
            gdeEur,
            expensesEur: input.healthExpensesEur ?? 0,
            filing: 'einzel',
            childrenBracket: input.childrenBracket ?? '0',
          }).deductibleEur,
        )
      : 0
  // § 10 Abs. 1 Nr. 4 EStG: church tax paid in the year (here: withheld with the wage) is a Sonderausgabe.
  const church = input.churchTax
  const churchTaxPaid = church?.membership.kind === 'member' ? (church.withheld ?? 0) : 0
  const specialExpenses = Math.max(input.specialExpensesLumpSum, input.donations + churchTaxPaid)
  // § 24b is deducted from the Summe der Einkünfte, so it lowers the zvE as well (#450 Teil 6).
  const zve = (provision: number) => Math.max(0, losses.gdeAfterLossesEur - provision - specialExpenses - deductibleBurdenEur)
  const taxableIncome = { from: zve(input.provision.to), to: zve(input.provision.from) }
  const reductionEur = input.householdReductionEur ?? 0
  const progression = input.progressionIncomeEur ?? 0
  // § 34 and § 34a take their parts out of the tariff (ADR-0101 §22); without them the tariff is as it was.
  const tariff = withSpecialTariffs((z: number) => (progression > 0 ? progressionClauseTax(z, progression, input.year) : incomeTax(z, input.year)), input.business?.special)
  // § 35 EStG comes off the tariff tax before § 35a (Rn. 4 of BMF 3.11.2016).
  const persons = [creditPerson(input.business, [otherIncome])]
  const credited = { from: afterTradeTaxCredit(persons, tariff(taxableIncome.from)), to: afterTradeTaxCredit(persons, tariff(taxableIncome.to)) }
  const incomeTaxOwed = {
    from: applyHouseholdTaxReduction(credited.from.taxEur, reductionEur),
    to: applyHouseholdTaxReduction(credited.to.taxEur, reductionEur),
  }
  const soliRange = { from: soli(incomeTaxOwed.from, input.year), to: soli(incomeTaxOwed.to, input.year) }
  const churchTax = church ? estimateChurchTax(input.year, church, taxableIncome, reductionEur) : undefined
  const churchBalance =
    churchTax?.kind === 'spanne'
      ? { from: churchTax.withheld - churchTax.due.to, to: churchTax.withheld - churchTax.due.from }
      : { from: 0, to: 0 }
  const prepaid = (input.prepayments?.incomeTaxEur ?? 0) + (input.prepayments?.soliEur ?? 0)
  const withBusiness = input.business !== undefined || input.losses !== undefined || input.prepayments !== undefined
  // The § 35 credit carries cents; without business facts the result stays exactly as before ADR-0101.
  const settle = (value: number) => (withBusiness ? roundToCents(value) : value)
  return {
    kind: 'spanne',
    werbungskosten: input.werbungskosten,
    provision: input.provision,
    specialExpenses,
    taxableIncome,
    incomeTax: incomeTaxOwed,
    solidaritaetszuschlag: soliRange,
    anrechnung: input.anrechnung + (input.prepayments?.incomeTaxEur ?? 0),
    result: {
      from: settle(input.alreadyPaid(incomeTaxOwed.to) + prepaid - soliRange.to + churchBalance.from),
      to: settle(input.alreadyPaid(incomeTaxOwed.from) + prepaid - soliRange.from + churchBalance.to),
    },
    ...(churchTax ? { churchTax } : {}),
    breakdown: {
      persons: [{ incomeEur: otherIncome, workExpensesEur: input.werbungskosten, creditedTaxEur: input.anrechnung }],
      totalIncomeEur: sumOfIncome,
      extraordinaryBurdenEur: deductibleBurdenEur,
      tariffTax: { from: credited.from.taxEur, to: credited.to.taxEur },
      householdReductionEur: credited.to.taxEur - incomeTaxOwed.to,
      ...(progression > 0 ? { progressionIncomeEur: progression } : {}),
    },
    ...(withBusiness
      ? {
          business: {
            selfEmployedEur: input.business?.selfEmployedEur ?? 0,
            tradeEur: input.business?.tradeEur ?? 0,
            gdeEur: gdeBeforeLosses,
            losses,
            tradeTaxCredit: { from: credited.from.creditEur, to: credited.to.creditEur },
          },
        }
      : {}),
  }
}

/**
 * Church tax of one single person: § 51a Abs. 2 EStG measures it on the tax after the child
 * allowances, even where Kindergeld wins. A single parent gets half or the whole allowance (transfer),
 * so the basis is a range between both.
 */
function estimateChurchTax(year: number, church: ChurchTaxInput, zvE: Range, reductionEur: number): EstimateChurchTax {
  const perChild = childTaxAllowance(year)
  const children = Math.max(0, Math.floor(church.children))
  const basisFor = (z: number, allowance: number) =>
    applyHouseholdTaxReduction(incomeTax(Math.max(0, z - children * allowance), year), reductionEur)
  const amount = churchTaxOnIncome({
    year,
    membership: church.membership,
    state: church.state,
    postalCode: church.postalCode,
    basis: { from: basisFor(zvE.from, perChild), to: basisFor(zvE.to, perChild / 2) },
    zvE,
  })
  if (amount.kind !== 'spanne') return amount
  if (church.withheld === null) return { kind: 'offen', reason: 'einbehalt-fehlt' }
  return { kind: 'spanne', due: amount.due, withheld: church.withheld, capOnApplication: amount.capOnApplication }
}

/**
 * Homeoffice-Pauschale (§ 4 Abs. 5 Satz 1 Nr. 6c EStG): per day worked at home, capped by days and
 * euros of the year (2022: 5 € / 120 days / 600 €; from 2023: 6 € / 210 days / 1.260 €). It is part of
 * the Werbungskosten, so it competes with the Arbeitnehmer-Pauschbetrag.
 */
export function homeOfficeAllowance(year: number, homeOfficeDays: number): number {
  if (!isSupportedIncomeTaxYear(year) || !Number.isFinite(homeOfficeDays) || homeOfficeDays <= 0) return 0
  const { dailyRateEur, maxDays, maxAnnualEur } = getTaxYearParameters(year).homeOffice
  return Math.min(Math.min(Math.floor(homeOfficeDays), maxDays) * dailyRateEur, maxAnnualEur)
}

/** Keeps a sum of euro amounts with cents free of float noise. */

function soli(incomeTaxAmount: number, year: number): number {
  if (!isSupportedIncomeTaxYear(year)) return 0
  return solidaritaetszuschlag(incomeTaxAmount, soliExemptionLimits(year).single)
}
