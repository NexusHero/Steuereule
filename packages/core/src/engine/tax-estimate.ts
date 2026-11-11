import { incomeTax, isSupportedIncomeTaxYear, soliExemptionLimits, solidaritaetszuschlag } from '../math/tarif'
import { getTaxYearParameters } from '../math/tax-parameters'
import { applyHouseholdTaxReduction } from '../domains/household-services'
import { calculateExtraordinaryBurden, type BurdenChildrenBracket } from '../domains/extraordinary-burdens'
import { churchTaxOnIncome, type ChurchMembership } from '../domains/church-tax'
import { childTaxAllowance } from '../domains/children'
import type { GermanState } from '../common/postal-codes'

export interface Range {
  readonly from: number
  readonly to: number
}

/** Kirchensteuer in the estimate (#450 Teil 6F, ADR-0063). */
export type EstimateChurchTax =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'offen'
      readonly reason: 'konfession-fehlt' | 'kappung-unbekannt' | 'kirchgeld-unbekannt' | 'einbehalt-fehlt'
    }
  | {
      readonly kind: 'spanne'
      readonly due: Range
      /** Church tax already withheld (LStB Zeilen 6 und 7) — credited like the wage tax. */
      readonly withheld: number
      readonly capOnApplication: boolean
    }

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
  /** § 24b EStG: single parent — the Entlastungsbetrag lowers the taxable income (and the GdE for § 33). */
  readonly singleParent?: boolean | undefined
  /** § 24b Abs. 2 Satz 2 EStG: children the relief counts (240 € more for each beyond the first; default 1). */
  readonly singleParentChildren?: number | undefined
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
    singleParentChildren: e.singleParentChildren,
    childrenBracket: e.childrenBracket,
    churchTax: e.churchTax,
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
    singleParentChildren: e.singleParentChildren,
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
  readonly singleParentChildren?: number | undefined
  readonly childrenBracket?: BurdenChildrenBracket | undefined
  readonly churchTax?: ChurchTaxInput | undefined
}): TaxEstimate {
  const params = getTaxYearParameters(input.year)
  const furtherChildren = Math.max(0, Math.floor(input.singleParentChildren ?? 1) - 1)
  const singleParentRelief = input.singleParent
    ? params.children.singleParentReliefEur + furtherChildren * params.children.singleParentAdditionalChildEur
    : 0
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
  // § 10 Abs. 1 Nr. 4 EStG: church tax paid in the year (here: withheld with the wage) is a Sonderausgabe.
  const church = input.churchTax
  const churchTaxPaid = church?.membership.kind === 'member' ? (church.withheld ?? 0) : 0
  const specialExpenses = Math.max(input.specialExpensesLumpSum, input.donations + churchTaxPaid)
  // § 24b is deducted from the Summe der Einkünfte, so it lowers the zvE as well (#450 Teil 6).
  const zve = (provision: number) =>
    Math.max(0, input.einnahmen - input.werbungskosten - singleParentRelief - provision - specialExpenses - deductibleBurdenEur)
  const taxableIncome = { from: zve(input.provision.to), to: zve(input.provision.from) }
  const reductionEur = input.householdReductionEur ?? 0
  const incomeTaxOwed = {
    from: applyHouseholdTaxReduction(incomeTax(taxableIncome.from, input.year), reductionEur),
    to: applyHouseholdTaxReduction(incomeTax(taxableIncome.to, input.year), reductionEur),
  }
  const soliRange = { from: soli(incomeTaxOwed.from, input.year), to: soli(incomeTaxOwed.to, input.year) }
  const churchTax = church ? estimateChurchTax(input.year, church, taxableIncome, reductionEur) : undefined
  const churchBalance =
    churchTax?.kind === 'spanne'
      ? { from: churchTax.withheld - churchTax.due.to, to: churchTax.withheld - churchTax.due.from }
      : { from: 0, to: 0 }
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
      from: input.alreadyPaid(incomeTaxOwed.to) - soliRange.to + churchBalance.from,
      to: input.alreadyPaid(incomeTaxOwed.from) - soliRange.from + churchBalance.to,
    },
    ...(churchTax ? { churchTax } : {}),
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

function soli(incomeTaxAmount: number, year: number): number {
  if (!isSupportedIncomeTaxYear(year)) return 0
  return solidaritaetszuschlag(incomeTaxAmount, soliExemptionLimits(year).single)
}
