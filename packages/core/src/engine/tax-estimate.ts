import { incomeTax, isSupportedIncomeTaxYear, soliExemptionLimits, solidaritaetszuschlag } from '../math/tarif'
import { getTaxYearParameters } from '../math/tax-parameters'
import { applyHouseholdTaxReduction } from '../domains/household-services'
import { calculateExtraordinaryBurden, type BurdenChildrenBracket } from '../domains/extraordinary-burdens'

export interface Range {
  readonly from: number
  readonly to: number
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
  /** § 24b EStG single-parent status used when deriving GdE for § 33 reasonable burden. */
  readonly singleParent?: boolean | undefined
  /** § 33 Abs. 3 EStG children bracket (defaults to '0'). */
  readonly childrenBracket?: BurdenChildrenBracket | undefined
}

/** The EUR lines of the Anlage N-Gre (anlageNGreBetraege) plus what the user pays outside the salary. */
export interface CrossBorderEstimateInput {
  readonly year: number
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
  /** § 24b EStG single-parent status used when deriving GdE for § 33 reasonable burden. */
  readonly singleParent?: boolean | undefined
  /** § 33 Abs. 3 EStG children bracket (defaults to '0'). */
  readonly childrenBracket?: BurdenChildrenBracket | undefined
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
    childrenBracket: e.childrenBracket,
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
  const provision = {
    from: e.retirementProvisionEur + e.healthInsuranceEur,
    to: e.retirementProvisionEur + otherDeductible,
  }
  return estimate({
    year: e.year,
    einnahmen: e.wageEur,
    werbungskosten: Math.max(params.lumpSums.employee, e.commuterAllowance),
    provision,
    donations: e.donations,
    alreadyPaid: (taxAmount) => e.withholdingTaxEur - taxAmount,
    anrechnung: e.withholdingTaxEur,
    specialExpensesLumpSum: params.lumpSums.specialExpensesSingle,
    householdReductionEur: e.householdReductionEur,
    healthExpensesEur: e.healthExpensesEur,
    singleParent: e.singleParent,
    childrenBracket: e.childrenBracket,
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
  readonly childrenBracket?: BurdenChildrenBracket | undefined
}): TaxEstimate {
  const params = getTaxYearParameters(input.year)
  const singleParentRelief = input.singleParent ? params.children.singleParentReliefEur : 0
  const gdeEur = Math.max(0, input.einnahmen - input.werbungskosten - singleParentRelief)
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
  const specialExpenses = Math.max(input.specialExpensesLumpSum, input.donations)
  const zve = (provision: number) =>
    Math.max(0, input.einnahmen - input.werbungskosten - provision - specialExpenses - deductibleBurdenEur)
  const taxableIncome = { from: zve(input.provision.to), to: zve(input.provision.from) }
  const reductionEur = input.householdReductionEur ?? 0
  const incomeTaxOwed = {
    from: applyHouseholdTaxReduction(incomeTax(taxableIncome.from, input.year), reductionEur),
    to: applyHouseholdTaxReduction(incomeTax(taxableIncome.to, input.year), reductionEur),
  }
  const soliRange = { from: soli(incomeTaxOwed.from, input.year), to: soli(incomeTaxOwed.to, input.year) }
  return {
    kind: 'spanne',
    werbungskosten: input.werbungskosten,
    provision: input.provision,
    specialExpenses,
    taxableIncome,
    incomeTax: incomeTaxOwed,
    solidaritaetszuschlag: soliRange,
    anrechnung: input.anrechnung,
    result: {
      from: input.alreadyPaid(incomeTaxOwed.to) - soliRange.to,
      to: input.alreadyPaid(incomeTaxOwed.from) - soliRange.from,
    },
  }
}

function soli(incomeTaxAmount: number, year: number): number {
  if (!isSupportedIncomeTaxYear(year)) return 0
  return solidaritaetszuschlag(incomeTaxAmount, soliExemptionLimits(year).single)
}
