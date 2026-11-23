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
  /** § 24b Abs. 2 Satz 2 EStG: Erhöhung des Entlastungsbetrags je weiterem Kind. */
  readonly singleParentAdditionalChildEur: number
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
  /** § 10 Abs. 3 Satz 1 EStG: Höchstbetrag der Altersvorsorgeaufwendungen je Person (Höchstbeitrag knappschaftliche RV). */
  readonly maxPensionProvisionEur: number
  /** § 10 Abs. 3 Satz 4 und 6 EStG: abziehbarer Anteil der Altersvorsorgeaufwendungen (2022: 94 %, ab 2023: 100 %). */
  readonly pensionDeductibleShare: number
}

/** § 35a EStG: Steuerermäßigung für haushaltsnahe Beschäftigungsverhältnisse, Dienstleistungen und Handwerkerleistungen. */
export interface HouseholdServicesParameters {
  /** § 35a Abs. 1 EStG: Geringfügige Beschäftigung (20 %, max. 510 €). */
  readonly minijobRate: number
  readonly minijobMaxEur: number
  /** § 35a Abs. 2 EStG: Haushaltsnahe Dienstleistungen & Pflege (20 %, max. 4.000 €). */
  readonly servicesRate: number
  readonly servicesMaxEur: number
  /** § 35a Abs. 3 EStG: Handwerkerleistungen (20 %, max. 1.200 €). */
  readonly craftsmenRate: number
  readonly craftsmenMaxEur: number
}

/** § 33 Abs. 3 EStG (stufenweise nach BFH VI R 75/14): Zumutbare Belastung. */
export interface ReasonableBurdenParameters {
  readonly tier1MaxGdeEur: number
  readonly tier2MaxGdeEur: number
  readonly rates: {
    readonly singleNoChildren: readonly [number, number, number]
    readonly jointNoChildren: readonly [number, number, number]
    readonly oneOrTwoChildren: readonly [number, number, number]
    readonly threeOrMoreChildren: readonly [number, number, number]
  }
}

/**
 * Employee contributions to the Swiss social insurances, withheld from the AHV wage (Lohnausweis Ziffer 9).
 * Used for a cross-border commuter's plausibility hint only (`ahvContributionFit`), never for a tax figure.
 */
export interface SwissSocialSecurityParameters {
  /**
   * AHV 4,35 % + IV 0,7 % + EO 0,25 % = 5,3 % (employee half). Source: BSV/Informationsstelle AHV/IV,
   * Merkblatt 2.01 „Beiträge an die AHV, IV und EO“, Stand 1.1.2024 and 1.1.2025 (Art. 5 AHVG, Art. 3 IVG,
   * Art. 27 EOG with the rates of Art. 36 EOV); unchanged since the EO rate of 0,5 % from 2021.
   */
  readonly ahvIvEoEmployeeRate: number
  /** ALV 1,1 % (employee half of 2,2 %), Art. 3 AVIG with Art. 3 AVIV; Merkblatt 2.08 „Beiträge an die ALV“ 2024/2025. */
  readonly alvEmployeeRate: number
  /** Highest insured wage of the ALV per year, 148.200 CHF since 2016 (Art. 3 Abs. 1 AVIG, Art. 22 Abs. 1 UVV). */
  readonly alvMaxWageChf: number
  /** Solidarity contribution of 0,5 % on the wage above the ALV maximum, abolished from 1.1.2023 (Art. 3 Abs. 2 AVIG a. F.). */
  readonly alvSolidarityRate: number
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
  /** § 35a EStG: Haushaltsnahe Aufwendungen und Handwerkerleistungen. */
  readonly householdServices: HouseholdServicesParameters
  /** § 33 Abs. 3 EStG: Zumutbare Belastung (BFH VI R 75/14). */
  readonly reasonableBurden: ReasonableBurdenParameters
  /** Swiss employee social contributions of the year (cross-border commuters, Lohnausweis Ziffer 9). */
  readonly swissSocialSecurity: SwissSocialSecurityParameters
}

const STATIC_BEA_EUR = 2928

const CHILDREN_BY_YEAR: Readonly<Record<IncomeTaxYear, { monthly: number; childAllowanceOnly: number; singleParentRelief: number }>> = {
  2022: { monthly: 219, childAllowanceOnly: 5620, singleParentRelief: 4008 },
  2023: { monthly: 250, childAllowanceOnly: 6024, singleParentRelief: 4260 },
  2024: { monthly: 250, childAllowanceOnly: 6612, singleParentRelief: 4260 },
  2025: { monthly: 255, childAllowanceOnly: 6672, singleParentRelief: 4260 },
  2026: { monthly: 259, childAllowanceOnly: 6828, singleParentRelief: 4260 },
}

/** § 10 Abs. 3 Satz 1 EStG: the highest contribution to the knappschaftliche Rentenversicherung of the year. */
const MAX_PENSION_PROVISION_BY_YEAR: Readonly<Record<IncomeTaxYear, number>> = {
  2022: 25639,
  2023: 26528,
  2024: 27566,
  2025: 29344,
  2026: 30826,
}

const FILING_DEADLINES_BY_YEAR: Readonly<Record<IncomeTaxYear, string>> = {
  2022: '2023-10-02',
  2023: '2024-09-02',
  2024: '2025-07-31',
  2025: '2026-07-31',
  // 31.07.2027 is a Saturday: § 108 Abs. 3 AO moves the deadline to Monday 02.08.2027 (#450 Teil 6).
  2026: '2027-08-02',
}

const VOLUNTARY_FILING_DEADLINES_BY_YEAR: Readonly<Record<IncomeTaxYear, string>> = {
  2022: '2026-12-31',
  2023: '2027-12-31',
  // 31.12.2028 is a Sunday and 01.01.2029 a holiday: the Festsetzungsfrist ends on 02.01.2029
  // (§ 108 Abs. 3 AO, BFH 20.01.2016 – VI R 14/15).
  2024: '2029-01-02',
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
      singleParentAdditionalChildEur: 240,
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
      maxPensionProvisionEur: MAX_PENSION_PROVISION_BY_YEAR[year],
      pensionDeductibleShare: year === 2022 ? 0.94 : 1,
    },
    maxOtherProvisionEur: 2800,
    householdServices: {
      minijobRate: 0.2,
      minijobMaxEur: 510,
      servicesRate: 0.2,
      servicesMaxEur: 4000,
      craftsmenRate: 0.2,
      craftsmenMaxEur: 1200,
    },
    reasonableBurden: {
      tier1MaxGdeEur: 15340,
      tier2MaxGdeEur: 51130,
      rates: {
        singleNoChildren: [0.05, 0.06, 0.07],
        jointNoChildren: [0.04, 0.05, 0.06],
        oneOrTwoChildren: [0.02, 0.03, 0.04],
        threeOrMoreChildren: [0.01, 0.01, 0.02],
      },
    },
    swissSocialSecurity: {
      ahvIvEoEmployeeRate: 0.053,
      alvEmployeeRate: 0.011,
      alvMaxWageChf: 148200,
      alvSolidarityRate: year === 2022 ? 0.005 : 0,
    },
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

// ---------------------------------------------------------------------------------------------
// Rules that change with the year (ADR-0102)
//
// Every year in which a rule changes is named here, so no rule elsewhere compares a year with a
// bare literal (enforced by `architecture.test.ts`). Many of these rules reach beyond the income-tax
// years of `TAX_YEAR_REGISTRY` (business rules run to 2032), so they are kept as steps, not per year.
// ---------------------------------------------------------------------------------------------

/** One step of a value that changes with the year: it holds from `from` until the next step begins. */
export interface YearStep<T> {
  readonly from: number
  readonly value: T
}

/** Steps of one value, at least one; the first covers every year before the first change. */
export type YearSteps<T> = readonly [YearStep<T>, ...YearStep<T>[]]

/** The first step covers every year before the first change. */
const ALWAYS = Number.NEGATIVE_INFINITY

/** The value of the step that covers `year`. Steps run in ascending order of `from`. */
export function valueForYear<T>(steps: YearSteps<T>, year: number): T {
  let value = steps[0].value
  for (const step of steps) if (year >= step.from) value = step.value
  return value
}

/** The first year in which each new rule applies. */
export const RULE_CHANGE_YEARS = {
  /** JStG 2022: the Arbeitszimmer as a 1.260 € Jahrespauschale; outside the centre of work only the Tagespauschale (§ 4 Abs. 5 Satz 1 Nr. 6b EStG). */
  homeOfficeReform: 2023,
  /** § 12 Abs. 3 UStG: 0 % for photovoltaic supplies, Kz 87 of the Voranmeldung. */
  vatZeroRatePhotovoltaic: 2023,
  /** Wachstumschancengesetz: § 34a Abs. 2 Satz 3 EStG, withdrawals pay the Thesaurierungssteuer first; the Gewerbesteuer is added back. */
  retainedProfitReform: 2024,
  /** § 19 Abs. 1 UStG (JStG 2024): 25.000 € / 100.000 €, the rule ends with the supply that crosses the running year's limit. */
  smallBusinessReform: 2025,
  /** Besonderes Kirchgeld from the step table valid from 2025. */
  kirchgeldTable2025: 2025,
  /** § 9 Nr. 1 Satz 1 GewStG (JStG 2024): the Grundsteuer booked in the year replaces 1,2 % of the Einheitswert. */
  tradeTaxLandDeductionByLandTax: 2025,
  /** JStG 2024: Kinderbetreuungskosten at 80 %, at most 4.800 € per child (§ 10 Abs. 1 Nr. 5 EStG). */
  childcareEightyPercent: 2025,
  /** BEG IV: Buchungsbelege are kept 8 years; applies to every Beleg whose old period had not run out by the end of the year before (Art. 97 § 19a EGAO). */
  bookingVoucherEightYears: 2025,
} as const

export type RuleChange = keyof typeof RULE_CHANGE_YEARS

/** Whether the rule named by `change` applies in `year`. */
export function appliesFrom(change: RuleChange, year: number): boolean {
  return year >= RULE_CHANGE_YEARS[change]
}

/** § 10 Abs. 1 Nr. 5 EStG: share of Kinderbetreuungskosten and cap per child. */
export const CHILDCARE_DEDUCTION_STEPS: YearSteps<{ readonly share: number; readonly capEur: number }> = [
  { from: ALWAYS, value: { share: 2 / 3, capEur: 4000 } },
  { from: RULE_CHANGE_YEARS.childcareEightyPercent, value: { share: 0.8, capEur: 4800 } },
]

/** § 32 Abs. 6 EStG: Kinderfreibetrag without the BEA part, for years outside `TAX_YEAR_REGISTRY`. */
export const CHILD_ALLOWANCE_FALLBACK_STEPS: YearSteps<number> = [
  { from: ALWAYS, value: 6024 },
  { from: 2024, value: 6828 },
]

/** § 66 EStG: monthly Kindergeld, for years outside `TAX_YEAR_REGISTRY`. */
export const CHILD_BENEFIT_FALLBACK_STEPS: YearSteps<number> = [
  { from: ALWAYS, value: 219 },
  { from: 2023, value: 250 },
]

/** § 23 Abs. 3 Satz 5 EStG: Freigrenze for private sales. */
export const PRIVATE_SALES_EXEMPTION_STEPS: YearSteps<number> = [
  { from: ALWAYS, value: 600 },
  { from: 2024, value: 1000 },
]

/** § 7 Abs. 4 Satz 1 EStG: AfA rate in percent by the year a residential building was completed. */
export const RESIDENTIAL_DEPRECIATION_STEPS: YearSteps<number> = [
  { from: ALWAYS, value: 2.5 },
  { from: 1925, value: 2 },
  { from: 2023, value: 3 },
]

/** § 22 Nr. 1 Satz 3 Buchst. a Doppelbuchst. aa EStG: Besteuerungsanteil in percent by the year the pension began; null after the table ends. */
export const PENSION_TAXABLE_SHARE_STEPS: YearSteps<number | null> = [
  { from: ALWAYS, value: 50 },
  ...Object.entries({
    2006: 52, 2007: 54, 2008: 56, 2009: 58, 2010: 60,
    2011: 62, 2012: 64, 2013: 66, 2014: 68, 2015: 70,
    2016: 72, 2017: 74, 2018: 76, 2019: 78, 2020: 80,
    2021: 81, 2022: 82,
    2023: 82.5, 2024: 83, 2025: 83.5, 2026: 84, 2027: 84.5, 2028: 85, 2029: 85.5, 2030: 86,
    2031: 86.5, 2032: 87, 2033: 87.5, 2034: 88, 2035: 88.5, 2036: 89, 2037: 89.5, 2038: 90,
    2039: 90.5, 2040: 91, 2041: 91.5, 2042: 92, 2043: 92.5, 2044: 93, 2045: 93.5, 2046: 94,
    2047: 94.5, 2048: 95, 2049: 95.5, 2050: 96, 2051: 96.5, 2052: 97, 2053: 97.5, 2054: 98,
    2055: 98.5, 2056: 99, 2057: 99.5, 2058: 100,
  }).map(([from, value]) => ({ from: Number(from), value })),
  { from: 2059, value: null },
]

/** § 16 Abs. 4 Satz 2 GewStG: minimum Hebesatz in percent; 280 % from EZ 2027 (§ 36 Abs. 5b GewStG). */
export const TRADE_TAX_MINIMUM_MULTIPLIER_STEPS: YearSteps<number> = [
  { from: ALWAYS, value: 200 },
  { from: 2027, value: 280 },
]

/** § 4 Abs. 5 Satz 1 Nr. 1 EStG: limit for business gifts per recipient (Wachstumschancengesetz from 2024). */
export const GIFT_LIMIT_STEPS: YearSteps<number> = [
  { from: ALWAYS, value: 35 },
  { from: 2024, value: 50 },
]

/** § 18 Abs. 2 Satz 2, 3 and Abs. 2a UStG: limits for monthly filing and for exemption from the Voranmeldung. */
export const VAT_PERIOD_LIMIT_STEPS: YearSteps<{ readonly monthlyAboveEur: number; readonly exemptUpToEur: number }> = [
  { from: ALWAYS, value: { monthlyAboveEur: 7_500, exemptUpToEur: 1_000 } },
  { from: 2025, value: { monthlyAboveEur: 9_000, exemptUpToEur: 2_000 } },
]

/** § 20 Satz 1 Nr. 1 UStG: prior-year turnover limit for Ist-Versteuerung (Wachstumschancengesetz from 2024). */
export const CASH_ACCOUNTING_LIMIT_STEPS: YearSteps<number> = [
  { from: ALWAYS, value: 600_000 },
  { from: 2024, value: 800_000 },
]

/** The years the Umsatzsteuer-Jahreserklärung covers. */
export const VAT_ANNUAL_RETURN_YEARS = { first: 2022, last: 2026 } as const

export function isVatAnnualReturnYear(year: number): boolean {
  return year >= VAT_ANNUAL_RETURN_YEARS.first && year <= VAT_ANNUAL_RETURN_YEARS.last
}

/** § 10d Abs. 1 EStG: Verlustrücktrag cap per person, by loss year (§ 52 Abs. 18b Satz 2 EStG for 2022 and 2023). */
export const LOSS_CARRY_BACK_CAP_STEPS: YearSteps<number> = [
  { from: ALWAYS, value: 10_000_000 },
  { from: 2024, value: 1_000_000 },
]

/** § 10d Abs. 2 EStG: share of the Verlustvortrag above the base; 70 % for VZ 2024–2027 (§ 52 Abs. 18b Satz 3 EStG). */
export const LOSS_CARRY_FORWARD_RATE_STEPS: YearSteps<number> = [
  { from: ALWAYS, value: 0.6 },
  { from: 2024, value: 0.7 },
  { from: 2028, value: 0.6 },
]

/**
 * § 8 Abs. 1a SGB IV: Minijob limit in € per month. The key is the year plus the month as a fraction
 * (`year + (month - 1) / 12`), since the limit rose to 520 € in October 2022.
 */
export const MINIJOB_LIMIT_STEPS: YearSteps<number> = [
  { from: ALWAYS, value: 450 },
  { from: 2022 + 9 / 12, value: 520 },
  { from: 2024, value: 538 },
  { from: 2025, value: 556 },
  { from: 2026, value: 603 },
]

/** § 34a Abs. 1 Satz 1 EStG: Thesaurierungssteuersatz (28,25 % until 2027, then down to 25 % from 2032). */
export const RETAINED_PROFIT_RATE_STEPS: YearSteps<number> = [
  { from: ALWAYS, value: 0.2825 },
  { from: 2028, value: 0.27 },
  { from: 2030, value: 0.26 },
  { from: 2032, value: 0.25 },
]

/** The tax years the Eule talks about today: a bare number among them in a chat message is a year, not an amount. */
export const CHAT_TAX_YEARS: readonly number[] = [2024, 2025, 2026]
