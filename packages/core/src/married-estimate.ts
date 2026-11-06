import type { Spanne, Steuerschaetzung } from './steuerschaetzung'
import { childTaxAllowance } from './kinder'
import { isSupportedIncomeTaxYear, soliFreigrenzen, solidaritaetszuschlag, splittingTarif } from './tarif'

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
}

export type MarriedEstimate =
  | (Extract<Steuerschaetzung, { kind: 'spanne' }> & {
      readonly childAllowanceUsed: boolean
      readonly churchTax: Spanne
      /** German wage tax was withheld, and with it Kirchensteuer we do not know — then it stays out of the result. */
      readonly churchTaxOpen: boolean
    })
  | { readonly kind: 'nicht-moeglich'; readonly grund: 'jahr-ohne-tarif' }

const EMPLOYEE_ALLOWANCE = 1230
/** § 10c EStG, doubled for a joint return. */
const SPECIAL_EXPENSES_ALLOWANCE_JOINT = 72
/** Deductible share of German employee social security (see steuerschaetzung.ts). */
const SOCIAL_SECURITY_DEDUCTIBLE: Spanne = { von: 0.91, bis: 0.93 }
/** § 10 Abs. 4 EStG for someone who pays their health insurance entirely themselves. */
const OTHER_PROVISION_CAP = 2800
/** Kirchensteuer is 8 % in Baden-Württemberg and Bayern, 9 % elsewhere — a range until the Land is known. */
const CHURCH_TAX_RATE: Spanne = { von: 0.08, bis: 0.09 }

interface SpouseFigures {
  readonly income: number
  readonly provision: Spanne
  readonly credit: number
}

function spouseFigures(s: SpouseIncome, year: number): SpouseFigures {
  if (s.kind === 'employee') {
    return {
      income: s.grossWage - Math.max(EMPLOYEE_ALLOWANCE, s.commuteAllowance),
      provision: {
        von: Math.round(s.socialSecurity * SOCIAL_SECURITY_DEDUCTIBLE.von) + s.selfPaidHealthCare,
        bis: Math.round(s.socialSecurity * SOCIAL_SECURITY_DEDUCTIBLE.bis) + s.selfPaidHealthCare,
      },
      credit: s.wageTax + solidaritaetszuschlag(s.wageTax, soliFreigrenzen(year as never).einzel),
    }
  }
  const other = Math.max(s.selfPaidHealthCare, Math.min(OTHER_PROVISION_CAP, s.selfPaidHealthCare + s.otherProvisionEur))
  return {
    income: s.wageEur - Math.max(EMPLOYEE_ALLOWANCE, s.commuteAllowance),
    provision: { von: s.pensionContributionsEur + s.selfPaidHealthCare, bis: s.pensionContributionsEur + other },
    credit: s.swissWithholdingEur,
  }
}

/**
 * A ranged estimate for a married couple filing jointly (ADR-0054): splitting tariff, the Kindergeld /
 * Kinderfreibetrag comparison, Soli on the tax after child allowances, rental surplus as income and
 * Kirchensteuer as a range. Never a point value (product ADR-015).
 */
export function estimateMarriedCouple(input: MarriedEstimateInput): MarriedEstimate {
  if (!isSupportedIncomeTaxYear(input.year)) return { kind: 'nicht-moeglich', grund: 'jahr-ohne-tarif' }
  const spouses = [input.a, ...(input.b ? [input.b] : [])].map((s) => spouseFigures(s, input.year))
  const income = spouses.reduce((sum, s) => sum + s.income, 0) + input.rentalSurplus
  const provision = {
    von: spouses.reduce((sum, s) => sum + s.provision.von, 0),
    bis: spouses.reduce((sum, s) => sum + s.provision.bis, 0),
  }
  const specialExpenses = Math.max(SPECIAL_EXPENSES_ALLOWANCE_JOINT, input.donations)
  const taxableIncome = (deduction: number) => Math.max(0, income - deduction - specialExpenses)
  const zve = { von: taxableIncome(provision.bis), bis: taxableIncome(provision.von) }

  const allowance = input.children * childTaxAllowance(input.year)
  const withAllowance = (z: number) => splittingTarif(Math.max(0, z - allowance), 0, input.year)
  const withBenefit = (z: number) => splittingTarif(z, 0, input.year)
  // Günstigerprüfung: the allowance only wins when it saves more tax than the Kindergeld paid out.
  const childAllowanceUsed = allowance > 0 && withBenefit(zve.bis) - withAllowance(zve.bis) > input.childBenefit
  const incomeTaxFor = (z: number) => (childAllowanceUsed ? withAllowance(z) + input.childBenefit : withBenefit(z))
  const einkommensteuer = { von: incomeTaxFor(zve.von), bis: incomeTaxFor(zve.bis) }

  // Soli and Kirchensteuer are always measured on the tax after the child allowances (§ 3 Abs. 2 SolZG, § 51a EStG).
  const freigrenze = soliFreigrenzen(input.year as never).zusammen
  const soli = {
    von: solidaritaetszuschlag(withAllowance(zve.von), freigrenze),
    bis: solidaritaetszuschlag(withAllowance(zve.bis), freigrenze),
  }
  const churchTax = input.churchMember
    ? { von: Math.round(withAllowance(zve.von) * CHURCH_TAX_RATE.von), bis: Math.round(withAllowance(zve.bis) * CHURCH_TAX_RATE.bis) }
    : { von: 0, bis: 0 }
  const churchTaxOpen = input.churchMember && [input.a, input.b].some((s) => s?.kind === 'employee')
  const churchTaxDue = churchTaxOpen ? { von: 0, bis: 0 } : churchTax

  const credit = spouses.reduce((sum, s) => sum + s.credit, 0)
  return {
    kind: 'spanne',
    werbungskosten: 0,
    vorsorge: provision,
    sonderausgaben: specialExpenses,
    zuVersteuerndesEinkommen: zve,
    einkommensteuer,
    solidaritaetszuschlag: soli,
    anrechnung: credit,
    ergebnis: {
      von: credit - einkommensteuer.bis - soli.bis - churchTaxDue.bis,
      bis: credit - einkommensteuer.von - soli.von - churchTaxDue.von,
    },
    childAllowanceUsed,
    churchTax,
    churchTaxOpen,
  }
}
