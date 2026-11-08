import {
  isSupportedIncomeTaxYear,
  soliExemptionLimits,
  TAX_YEARS,
  type IncomeTaxYear,
  type SoliExemptionLimits,
  type TariffCoefficients,
} from './tarif'

/** § 9 Abs. 1 Satz 3 Nr. 4 EStG: Entfernungspauschale je Arbeitstag. */
export interface CommuteParameters {
  readonly firstKmThreshold: number
  readonly rateFirstEur: number
  readonly rateAdditionalEur: number
  /** Höchstbetrag ohne PKW nach § 9 Abs. 1 Satz 3 Nr. 4 Satz 2 EStG (4.500 €). */
  readonly maxWithoutCarEur: number
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

/** Kinderbezogene Beträge und Freibeträge je Steuerjahr (§ 32 Abs. 6 & § 66 EStG). */
export interface ChildrenParameters {
  /** Gesetzlicher monatlicher Anspruch auf Kindergeld je Kind. */
  readonly monthlyBenefitEur: number
  /** Jahresanspruch auf Kindergeld je Kind (`monthlyBenefitEur * 12`). */
  readonly annualBenefitEur: number
  /** § 32 Abs. 6 EStG: Kinderfreibetrag (ohne BEA) für beide Elternteile. */
  readonly childAllowanceOnlyEur: number
  /** § 32 Abs. 6 EStG: Freibetrag für Betreuung, Erziehung oder Ausbildung (BEA). */
  readonly beaAllowanceEur: number
  /** § 32 Abs. 6 EStG: Gesamter Freibetrag (Kinderfreibetrag + BEA) für beide Elternteile. */
  readonly childAllowanceTotalEur: number
  /** § 24b EStG: Entlastungsbetrag für Alleinerziehende. */
  readonly singleParentReliefEur: number
}

/** § 149 Abs. 2 AO / § 152 AO / § 169 AO: Gesetzliche Abgabefristen und Verspätungszuschläge. */
export interface DeadlineParameters {
  /** Gesetzliche Abgabefrist für die Pflichtveranlagung (§ 149 Abs. 2 AO). */
  readonly standardFilingDeadline: string
  /** Gesetzliche Festsetzungsverjährung für die Antragsveranlagung (§ 169 Abs. 2 Satz 1 Nr. 2 AO: 4 Jahre). */
  readonly voluntaryFilingDeadline: string
  /** Vorwarnschwelle in Tagen. */
  readonly warningThresholdDays: number
  /** § 152 Abs. 5 Satz 2 AO: Mindest-Verspätungszuschlag (25 € pro Monat). */
  readonly lateFilingMinEur: number
  /** § 152 Abs. 5 Satz 1 AO: Monatlicher Verspätungszuschlag in Prozent (0,25 %). */
  readonly lateFilingPercentPerMonth: number
}

/** § 32d EStG: Parameter für die Besteuerung von Kapitalerträgen. */
export interface CapitalParameters {
  /** § 32d Abs. 1 EStG: Abgeltungsteuersatz (25 %). */
  readonly flatRateTaxRate: number
  /** § 32d Abs. 1 Satz 4 EStG: Kirchensteuer-Abzugsfaktor (0,25). */
  readonly churchTaxReductionShare: number
}

/** § 10 Abs. 1 Nr. 3 & Abs. 4 EStG: Vorsorgeaufwendungen. */
export interface ProvisionParameters {
  /** § 10 Abs. 1 Nr. 3 Satz 2 EStG: Gesetzliche Kürzung bei Krankengeldanspruch (4 %). */
  readonly sickPayReductionRate: number
  /** § 10 Abs. 4 EStG: Höchstbetrag sonstige Vorsorgeaufwendungen (Selbstzahler/Grenzgänger: 2.800 €). */
  readonly maxOtherProvisionSingleEur: number
  /** § 10 Abs. 4 EStG: Höchstbetrag sonstige Vorsorgeaufwendungen (Arbeitnehmer mit AG-Anteil: 1.900 €). */
  readonly maxOtherProvisionEmployeeEur: number
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
  /** Gesetzliche Fristen und Verspätungszuschläge nach AO. */
  readonly deadlines: DeadlineParameters
  /** Abgeltungsteuer und Kapitalertragsparameter. */
  readonly capital: CapitalParameters
  /** Vorsorgeaufwendungen (§ 10 EStG). */
  readonly provision: ProvisionParameters
  /** § 10 Abs. 4 EStG: Höchstbetrag für sonstige Vorsorgeaufwendungen (Selbstzahler / Grenzgänger: 2.800 €). */
  readonly maxOtherProvisionEur: number
}

const STATIC_BEA_EUR = 2928

const CHILDREN_BY_YEAR: Readonly<Record<IncomeTaxYear, { monthly: number; childAllowanceOnly: number; singleParentRelief: number }>> = {
  2022: { monthly: 219, childAllowanceOnly: 5620, singleParentRelief: 4008 },
  2023: { monthly: 250, childAllowanceOnly: 6024, singleParentRelief: 4260 },
  2024: { monthly: 250, childAllowanceOnly: 6612, singleParentRelief: 4260 },
  2025: { monthly: 255, childAllowanceOnly: 6672, singleParentRelief: 4260 },
  2026: { monthly: 259, childAllowanceOnly: 6828, singleParentRelief: 4260 },
}

const FILING_DEADLINES_BY_YEAR: Readonly<Record<IncomeTaxYear, string>> = {
  2022: '2023-10-02',
  2023: '2024-09-02',
  2024: '2025-07-31',
  2025: '2026-07-31',
  2026: '2027-07-31',
}

const VOLUNTARY_FILING_DEADLINES_BY_YEAR: Readonly<Record<IncomeTaxYear, string>> = {
  2022: '2026-12-31',
  2023: '2027-12-31',
  2024: '2028-12-31',
  2025: '2029-12-31',
  2026: '2030-12-31',
}

function buildParametersForYear(year: IncomeTaxYear): TaxYearParameters {
  const tariff = TAX_YEARS[year]
  const soli = soliExemptionLimits(year)
  const childData = CHILDREN_BY_YEAR[year]

  const commute: CommuteParameters =
    year >= 2026
      ? { firstKmThreshold: 0, rateFirstEur: 0.38, rateAdditionalEur: 0.38, maxWithoutCarEur: 4500 }
      : { firstKmThreshold: 20, rateFirstEur: 0.3, rateAdditionalEur: 0.38, maxWithoutCarEur: 4500 }

  return {
    year,
    basicAllowance: tariff.basicAllowance,
    tariff,
    soliLimits: soli,
    lumpSums: {
      employee: year === 2022 ? 1200 : 1230,
      specialExpensesSingle: 36,
      specialExpensesJoint: 72,
      saverSingle: year === 2022 ? 801 : 1000,
      saverJoint: year === 2022 ? 1602 : 2000,
    },
    commute,
    homeOffice:
      year === 2022
        ? { dailyRateEur: 5, maxDays: 120, maxAnnualEur: 600 }
        : { dailyRateEur: 6, maxDays: 210, maxAnnualEur: 1260 },
    children: {
      monthlyBenefitEur: childData.monthly,
      annualBenefitEur: childData.monthly * 12,
      childAllowanceOnlyEur: childData.childAllowanceOnly,
      beaAllowanceEur: STATIC_BEA_EUR,
      childAllowanceTotalEur: childData.childAllowanceOnly + STATIC_BEA_EUR,
      singleParentReliefEur: childData.singleParentRelief,
    },
    deadlines: {
      standardFilingDeadline: FILING_DEADLINES_BY_YEAR[year],
      voluntaryFilingDeadline: VOLUNTARY_FILING_DEADLINES_BY_YEAR[year],
      warningThresholdDays: 60,
      lateFilingMinEur: 25,
      lateFilingPercentPerMonth: 0.25,
    },
    capital: {
      flatRateTaxRate: 0.25,
      churchTaxReductionShare: 0.25,
    },
    provision: {
      sickPayReductionRate: 0.04,
      maxOtherProvisionSingleEur: 2800,
      maxOtherProvisionEmployeeEur: 1900,
    },
    maxOtherProvisionEur: 2800,
  }
}

const TAX_YEAR_REGISTRY: Readonly<Record<IncomeTaxYear, TaxYearParameters>> = {
  2022: buildParametersForYear(2022),
  2023: buildParametersForYear(2023),
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
