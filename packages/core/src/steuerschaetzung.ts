import { incomeTax, isSupportedIncomeTaxYear, soliExemptionLimits, solidaritaetszuschlag } from './tarif'

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
}

const EMPLOYEE_LUMP_SUM = 1230
const SPECIAL_EXPENSES_LUMP_SUM = 36

/**
 * Deductible share of the employee's social security contributions (RV fully, KV less 4 % for Krankengeld, PV
 * fully, AV absorbed by the Höchstbetrag): 91–93 % depending on Zusatzbeitrag and Kinderlosenzuschlag.
 */
const SV_DEDUCTIBLE: Range = { from: 0.91, to: 0.93 }

/** § 10 Abs. 4 EStG for someone who pays their health insurance entirely themselves, as a Grenzgänger does. */
const MAX_OTHER_PROVISION = 2800

/** A ranged estimate of the Einkommensteuer for one single Angestellte — never a point value (product ADR-015). */
export function taxEstimateEmployee(e: EmployeeEstimateInput): TaxEstimate {
  if (!isSupportedIncomeTaxYear(e.year)) return { kind: 'nicht-moeglich', reason: 'jahr-ohne-tarif' }
  const provision = {
    from: Math.round(e.sozialversicherung * SV_DEDUCTIBLE.from) + e.selfPaidKvPv,
    to: Math.round(e.sozialversicherung * SV_DEDUCTIBLE.to) + e.selfPaidKvPv,
  }
  const werbungskosten = Math.max(EMPLOYEE_LUMP_SUM, e.commuterAllowance + e.otherIncomeRelatedExpenses)
  return estimate({
    year: e.year,
    einnahmen: e.bruttoarbeitslohn,
    werbungskosten,
    provision,
    donations: e.donations,
    alreadyPaid: (est) => e.lohnsteuer - est + soli(e.lohnsteuer, e.year),
    anrechnung: e.lohnsteuer,
  })
}

/** A ranged estimate for a Grenzgänger CH: German tax against the creditable Swiss withholding tax (Art. 15a DBA). */
export function taxEstimateCrossBorder(e: CrossBorderEstimateInput): TaxEstimate {
  if (!isSupportedIncomeTaxYear(e.year)) return { kind: 'nicht-moeglich', reason: 'jahr-ohne-tarif' }
  const otherDeductible = Math.max(e.healthInsuranceEur, Math.min(MAX_OTHER_PROVISION, e.healthInsuranceEur + e.otherProvisionEur))
  const provision = {
    from: e.retirementProvisionEur + e.healthInsuranceEur,
    to: e.retirementProvisionEur + otherDeductible,
  }
  return estimate({
    year: e.year,
    einnahmen: e.wageEur,
    werbungskosten: Math.max(EMPLOYEE_LUMP_SUM, e.commuterAllowance),
    provision,
    donations: e.donations,
    alreadyPaid: (est) => e.withholdingTaxEur - est,
    anrechnung: e.withholdingTaxEur,
  })
}

function estimate(input: {
  readonly year: number
  readonly einnahmen: number
  readonly werbungskosten: number
  readonly provision: Range
  readonly donations: number
  readonly alreadyPaid: (einkommensteuer: number) => number
  readonly anrechnung: number
}): TaxEstimate {
  const specialExpenses = Math.max(SPECIAL_EXPENSES_LUMP_SUM, input.donations)
  const zve = (provision: number) => Math.max(0, input.einnahmen - input.werbungskosten - provision - specialExpenses)
  const taxableIncome = { from: zve(input.provision.to), to: zve(input.provision.from) }
  const einkommensteuer = {
    from: incomeTax(taxableIncome.from, input.year),
    to: incomeTax(taxableIncome.to, input.year),
  }
  const soliRange = { from: soli(einkommensteuer.from, input.year), to: soli(einkommensteuer.to, input.year) }
  return {
    kind: 'spanne',
    werbungskosten: input.werbungskosten,
    provision: input.provision,
    specialExpenses,
    taxableIncome,
    incomeTax: einkommensteuer,
    solidaritaetszuschlag: soliRange,
    anrechnung: input.anrechnung,
    result: {
      from: input.alreadyPaid(einkommensteuer.to) - soliRange.to,
      to: input.alreadyPaid(einkommensteuer.from) - soliRange.from,
    },
  }
}

function soli(einkommensteuer: number, year: number): number {
  if (!isSupportedIncomeTaxYear(year)) return 0
  return solidaritaetszuschlag(einkommensteuer, soliExemptionLimits(year).single)
}
