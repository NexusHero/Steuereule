import {
  isSupportedIncomeTaxYear,
  soliExemptionLimits,
  TAX_YEARS,
  type IncomeTaxYear,
  type SoliExemptionLimits,
  type TariffCoefficients,
} from './tarif'
import { childTaxAllowance, monthlyChildBenefitClaim } from './children'

/** § 9 Abs. 1 Satz 3 Nr. 4 EStG: Entfernungspauschale je Arbeitstag. */
export interface CommuteParameters {
  readonly firstKmThreshold: number
  readonly rateFirstEur: number
  readonly rateAdditionalEur: number
}

/** § 4 Abs. 5 Satz 1 Nr. 6b EStG / § 9 Abs. 5 EStG: Homeoffice-Tagespauschale. */
export interface HomeOfficeParameters {
  readonly dailyRateEur: number
  readonly maxDays: number
  readonly maxAnnualEur: number
}

/** Gesetzliche Pauschbeträge je Steuerjahr. */
export interface LumpSumParameters {
  /** § 9a Satz 1 Nr. 1 Buchst. a EStG: Arbeitnehmer-Pauschbetrag (Werbungskosten). */
  readonly employee: number
  /** § 10c EStG: Sonderausgaben-Pauschbetrag für Einzelveranlagung. */
  readonly specialExpensesSingle: number
  /** § 10c EStG: Sonderausgaben-Pauschbetrag für Zusammenveranlagung. */
  readonly specialExpensesJoint: number
  /** § 20 Abs. 9 EStG: Sparer-Pauschbetrag (Kapitalerträge) für Einzelveranlagung. */
  readonly saverSingle: number
  /** § 20 Abs. 9 EStG: Sparer-Pauschbetrag (Kapitalerträge) für Zusammenveranlagung. */
  readonly saverJoint: number
}

/** Kinderbezogene Beträge und Freibeträge je Steuerjahr. */
export interface ChildrenParameters {
  /** Gesetzlicher monatlicher Anspruch auf Kindergeld je Kind. */
  readonly monthlyBenefitEur: number
  /** Jahresanspruch auf Kindergeld je Kind (`monthlyBenefitEur * 12`). */
  readonly annualBenefitEur: number
  /** § 32 Abs. 6 EStG: Kinderfreibetrag inkl. BEA-Freibetrag für beide Elternteile. */
  readonly childAllowanceTotalEur: number
  /** § 24b EStG: Entlastungsbetrag für Alleinerziehende. */
  readonly singleParentReliefEur: number
}

/**
 * Vollständiges, typisiertes Parameterset aller steuerlichen Kennzahlen, Tarife
 * und Freibeträge für ein bestimmtes Veranlagungsjahr.
 *
 * Folgt dem Temporal Parameter Registry Pattern: Formeln im Rechenkern bleiben stabil,
 * während alle zeitabhängigen Beträge an das jeweilige Steuerjahr gebunden sind.
 */
export interface TaxYearParameters {
  readonly year: IncomeTaxYear
  /** § 32a Abs. 1 Satz 2 EStG: Grundfreibetrag. */
  readonly basicAllowance: number
  /** § 32a EStG: Koeffizienten für die 5 Einkommensteuer-Tarifzonen. */
  readonly tariff: TariffCoefficients
  /** § 3 Abs. 3 SolZG: Freigrenzen für den Solidaritätszuschlag. */
  readonly soliLimits: SoliExemptionLimits
  /** Gesetzliche Pauschbeträge. */
  readonly lumpSums: LumpSumParameters
  /** Entfernungspauschale für den Arbeitsweg. */
  readonly commute: CommuteParameters
  /** Homeoffice-Pauschale. */
  readonly homeOffice: HomeOfficeParameters
  /** Kinder- und Familienleistungen. */
  readonly children: ChildrenParameters
  /** § 10 Abs. 4 EStG: Höchstbetrag für sonstige Vorsorgeaufwendungen (Selbstzahler / Grenzgänger). */
  readonly maxOtherProvisionEur: number
}

function buildParametersForYear(year: IncomeTaxYear): TaxYearParameters {
  const tariff = TAX_YEARS[year]
  const soli = soliExemptionLimits(year)
  const monthlyBenefit = monthlyChildBenefitClaim(year)
  const childAllowance = childTaxAllowance(year)

  const commute: CommuteParameters =
    year >= 2026
      ? { firstKmThreshold: 0, rateFirstEur: 0.38, rateAdditionalEur: 0.38 }
      : { firstKmThreshold: 20, rateFirstEur: 0.3, rateAdditionalEur: 0.38 }

  return {
    year,
    basicAllowance: tariff.basicAllowance,
    tariff,
    soliLimits: soli,
    lumpSums: {
      employee: 1230,
      specialExpensesSingle: 36,
      specialExpensesJoint: 72,
      saverSingle: 1000,
      saverJoint: 2000,
    },
    commute,
    homeOffice: {
      dailyRateEur: 6,
      maxDays: 210,
      maxAnnualEur: 1260,
    },
    children: {
      monthlyBenefitEur: monthlyBenefit,
      annualBenefitEur: monthlyBenefit * 12,
      childAllowanceTotalEur: childAllowance,
      singleParentReliefEur: 4260,
    },
    maxOtherProvisionEur: 2800,
  }
}

const TAX_YEAR_REGISTRY: Readonly<Record<IncomeTaxYear, TaxYearParameters>> = {
  2024: buildParametersForYear(2024),
  2025: buildParametersForYear(2025),
  2026: buildParametersForYear(2026),
}

/**
 * Liefert die gesetzeskonformen Freibeträge, Pauschbeträge und Tarife für das angegebene Steuerjahr.
 *
 * @throws {RangeError} Wenn für das angegebene Jahr noch kein Parametersatz hinterlegt ist.
 */
export function getTaxYearParameters(year: number): TaxYearParameters {
  if (!isSupportedIncomeTaxYear(year)) {
    throw new RangeError(`Unsupported tax year: ${year}`)
  }
  return TAX_YEAR_REGISTRY[year]
}

/**
 * Alias für `getTaxYearParameters`.
 */
export const taxParameters = getTaxYearParameters
