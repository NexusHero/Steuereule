import type { VatFilingPeriod, SmallBusinessResult, ChartOfAccounts, BookkeepingMode, FinancingComponents, ChurchCode, JournalEntry, ProfessionAnswers, ProfessionSuggestion } from '@steuereule/core'
import type { BusinessPerson } from './business.repository.js'
import type { BookIntegrity } from './business-ledger.js'

/** The facts of the Gewerbesteuer-Erklärung the books do not hold (§ 8 Nr. 1, § 9 Nr. 1, § 10a GewStG), in euros. */
export interface TradeTaxInputs {
  readonly financing?: FinancingComponents
  readonly otherAdditionsEur?: number
  readonly einheitswertEur?: number
  readonly otherDeductionsEur?: number
  readonly lossCarriedForwardEur?: number
}

/**
 * The Voranmeldung facts of the person (ADR-0101 §22): the period the office set (else derived from the
 * year before), the Dauerfristverlängerung, the Sondervorauszahlung as paid, the monthly choice on a refund.
 */
export interface VatPeriodFacts {
  readonly period?: VatFilingPeriod | undefined
  readonly extension?: boolean | undefined
  readonly specialPrepaymentEur?: number | undefined
  readonly chooseMonthly?: boolean | undefined
  /** Freed by the office from keeping books (§ 148 AO): Istversteuerung whatever the turnover (§ 20 Satz 1 Nr. 2 UStG). */
  readonly exemptFromBookkeeping?: boolean | undefined
}

export interface VatPrepaymentOverview {
  readonly period: VatFilingPeriod
  readonly periodSource: 'angabe' | 'vorjahressteuer' | 'gruendung_schaetzung' | 'wahl_ueberschuss'
  readonly extension: boolean
  /** Monthly filers with the Dauerfristverlängerung only; deducted in December. */
  readonly specialPrepaymentEur: number | null
  readonly periods: readonly { readonly label: string; readonly from: string; readonly to: string; readonly due: string; readonly kennzahlen: Readonly<Record<string, number>>; readonly vatDueEur: number }[]
  /** All prepayments of the year with the Sondervorauszahlung: the Vorauszahlungssoll of the annual return. */
  readonly totalEur: number
  readonly ecSalesList: { readonly period: 'monat' | 'quartal'; readonly reports: readonly { readonly label: string; readonly due: string; readonly rows: readonly { readonly vatId: string | null; readonly goodsEur: number; readonly servicesEur: number }[] }[] }
}

/** One asset's § 15a correction of the year; `inPrepayment`: above 6.000 € or a sale, already in the Voranmeldung (§ 44 Abs. 3 UStDV). */
export interface InputVatCorrectionLine {
  readonly assetId: string
  readonly label: string
  readonly correctionEur: number
  readonly inPrepayment: boolean
}

/** A building's facts (§ 7 Abs. 4, 5a EStG). */
export interface BuildingFactsInput {
  readonly use: 'betrieb' | 'wohnen'
  readonly completed: string
  readonly applicationFiled?: string | undefined
  readonly constructionStarted?: string | undefined
  readonly contractSigned?: string | undefined
}

/** The § 7g Sonder-AfA per year in cents, the cut of the cost in cents and the profit of the year before (Abs. 6 Nr. 1). */
export interface SpecialDepreciationInput {
  readonly byYear: Readonly<Record<string, number>>
  readonly costReduction?: number | undefined
  readonly priorYearProfitEur?: number | undefined
}

/** The Vorsteuerberichtigung of an asset (§ 15a UStG): input VAT in cents, the shares (0–1). */
export interface VatCorrectionInput {
  readonly inputVatCents: number
  readonly originalShare: number
  readonly shareByYear: Readonly<Record<string, number>>
  /** The share the asset's sale or Entnahme would allow (1 taxable, 0 tax-free); dated by its disposal. */
  readonly disposalShare?: number | undefined
}

/** One payroll run as entered (ADR-0101 §22): the outside payroll's amounts, or a Minijob's gross. */
export interface PayrollRunInput {
  readonly month: number
  readonly kind: 'regulaer' | 'minijob'
  readonly employee: string
  readonly grossEur: number
  readonly wageTaxEur?: number | undefined
  readonly soliEur?: number | undefined
  readonly churchTaxEur?: number | undefined
  readonly church?: ChurchCode | null | undefined
  readonly employeeSocialEur?: number | undefined
  readonly employerSocialEur?: number | undefined
  /** Pauschale Lohnsteuer the employer takes over (Kz 41), for gifts under § 37b (Kz 44), pauschale Kirchensteuer (Kz 47). */
  readonly flatWageTaxEur?: number | undefined
  readonly flat37bTaxEur?: number | undefined
  readonly flatChurchTaxEur?: number | undefined
  /** BAV-Förderbetrag taken off the wage tax (§ 100 EStG, Kz 45), at most 288 € a year per employee. */
  readonly bavSupportEur?: number | undefined
  /** Minijob: the flat KV only for a Minijobber in the statutory insurance. */
  readonly statutoryHealthInsured?: boolean | undefined
  /** Minijob: exempt from the RV on application. */
  readonly rvExempt?: boolean | undefined
  /** Minijob: false for an employer with more than 30 employees, who pays no U1 (§ 1 Abs. 1 AAG). */
  readonly u1Applies?: boolean | undefined
}

export interface PayrollOverview {
  readonly runs: readonly { readonly id: string; readonly month: number; readonly kind: 'regulaer' | 'minijob'; readonly employee: string; readonly grossEur: number; readonly netEur: number; readonly wageTaxEur: number; readonly employerChargesEur: number; readonly entryNumber: number | null }[]
  readonly wageTaxPeriod: 'monat' | 'quartal' | 'jahr'
  readonly wageTaxReturns: readonly { readonly label: string; readonly due: string; readonly kennzahlen: Readonly<Record<string, number>> }[]
  /** The Minijob charges per month, to the Minijob-Zentrale (Beitragsnachweis), due on the third last bank day. */
  readonly minijobCharges: readonly { readonly month: number; readonly totalEur: number }[]
  /** Church-tax codes the Anmeldung of the Betriebsstätte's Land has no line for: their tax is in Kz 83 only. */
  readonly unassignedChurchCodes: readonly string[]
}

/** The sale or giving up of the business in the year (§ 16 EStG) and how its gain is taxed (§ 34 EStG). */
export interface DisposalFacts {
  readonly kind: 'veraeusserung' | 'aufgabe'
  readonly date: string
  readonly priceEur: number
  readonly costsEur: number
  /** Wert des Betriebsvermögens (capital account) at the date. */
  readonly capitalAccountEur: number
  /** § 16 Abs. 4: applied for; age 55 or permanently unable to work, never used before. */
  readonly allowance: boolean
  /** § 34 Abs. 1 Fünftelregelung, Abs. 3 reduced rate (age 55 or disabled, once in a life), or the plain tariff. */
  readonly method: 'fuenftel' | 'ermaessigt' | 'keine'
}

/** § 34a of a Bilanzierer: the amount applied for and the nachversteuerungspflichtige Betrag carried. */
export interface RetainedFacts {
  readonly requestedEur: number
  readonly carriedForwardEur?: number | undefined
  /** From 2024: withdrawals made to pay the § 34a tax (Abs. 2 Satz 2). */
  readonly withdrawalsForRetainedTaxEur?: number | undefined
}

/** § 10d facts: the Verlustvortrag of the last Feststellungsbescheid, the waiver of the Rücktrag, room in the years before. */
export interface LossFacts {
  readonly carriedForwardEur?: number
  readonly waiveCarryBack?: boolean
  /** What the Gesamtbetrag der Einkünfte of the year before and the second year before still offers. */
  readonly roomEur?: readonly [number, number]
  /** A later year's loss the user carries back into this year. */
  readonly carriedBackEur?: number
}

/** A share of a partnership's profit as its Feststellungsbescheid states it (ADR-0101 §3). */
export interface PartnershipShare {
  readonly name: string
  readonly kind: 'freiberuf' | 'gewerbe'
  readonly profitEur: number
  readonly baseAmountEur?: number
  readonly tradeTaxEur?: number
}

export interface BusinessProfileView {
  readonly person: BusinessPerson
  /** The business number of the person, from 1 (ADR-0101 §22). */
  readonly business: number
  readonly confirmedKind: 'freiberuf' | 'gewerbe' | null
  readonly professionAnswers: ProfessionAnswers | null
  readonly suggestion: ProfessionSuggestion | null
  readonly name: string | null
  readonly mode: BookkeepingMode
  readonly chart: ChartOfAccounts
  readonly smallBusiness: boolean
  readonly vatMethod: 'ist' | 'soll'
  readonly municipalityAgs: string | null
  readonly multiplierOverride: number | null
  readonly startDate: string | null
  readonly vatPrepaymentsCents: number | null
  readonly vatPeriodFacts: VatPeriodFacts
  readonly disposalFacts: DisposalFacts | null
  readonly retainedFacts: RetainedFacts | null
  readonly tradeTaxInputs: TradeTaxInputs
  readonly lossFacts: LossFacts
  readonly partnershipShares: readonly PartnershipShare[]
  readonly bookExists: boolean
}

export interface ProfileInput {
  readonly confirmedKind?: 'freiberuf' | 'gewerbe' | null | undefined
  readonly professionAnswers?: Partial<ProfessionAnswers> | null | undefined
  readonly name?: string | null | undefined
  readonly mode?: BookkeepingMode | undefined
  readonly chart?: ChartOfAccounts | undefined
  readonly smallBusiness?: boolean | undefined
  readonly vatMethod?: 'ist' | 'soll' | undefined
  readonly municipalityAgs?: string | null | undefined
  readonly multiplierOverride?: number | null | undefined
  readonly startDate?: string | null | undefined
  readonly vatPrepaymentsCents?: number | null | undefined
  readonly vatPeriodFacts?: VatPeriodFacts | null | undefined
  readonly disposalFacts?: DisposalFacts | null | undefined
  readonly retainedFacts?: RetainedFacts | null | undefined
  readonly tradeTaxInputs?: TradeTaxInputs | null | undefined
  readonly lossFacts?: LossFacts | null | undefined
  readonly partnershipShares?: readonly PartnershipShare[] | null | undefined
}

export interface BookView {
  readonly chart: ChartOfAccounts
  readonly mode: BookkeepingMode
  readonly lockedThrough: string | null
  readonly integrity: BookIntegrity
  readonly entries: readonly (JournalEntry & { readonly source: string; readonly reversedBy: number | null })[]
}

export interface ElsterLineValue {
  readonly id: string
  readonly zeile: string | null
  readonly kennzahlen: readonly string[]
  readonly label: string
  /** The column heading where one line holds several boxes (vom / bis, CHF / EUR); null otherwise. */
  readonly column: string | null
  /** Euros, or a word („Ja“) where the line takes one; null where the app has nothing for it. */
  readonly value: number | string | null
}

export interface ElsterHelp {
  /** A business form (ElsterForm) or an income-tax Vordruck of the paper printout (`anlage-n`, …). */
  readonly form: string
  readonly year: number
  readonly status: 'published' | 'not_published' | 'not_available'
  /** German, for the user: why a year or form has no line numbers. */
  readonly note: string | null
  readonly sourceUrl: string | null
  /**
   * Whether the lines carry official Zeile numbers. False for Anlage S/G (electronic only), for an
   * unpublished year and for GewSt 1 A (the ELSTER help names the fields, not their Zeile): the app then
   * names the field by its label („Feld in Mein ELSTER: …“).
   */
  readonly lineNumbersAvailable: boolean
  readonly lines: readonly ElsterLineValue[]
}

/** The Kleinunternehmer test of the year (§ 19 UStG) against the book, and whether the profile says the same. */
export interface SmallBusinessCheck extends SmallBusinessResult {
  readonly foundingYear: boolean
  /** The turnover of the year before was read from its book; without it only the running year is tested. */
  readonly priorYearKnown: boolean
  readonly turnoverEur: number
  /**
   * False when the profile claims the Kleinunternehmer rule and the turnover crossed a limit. Eligible
   * without the flag is fine: the user may waive the rule (§ 19 Abs. 2 aF, Abs. 3 nF UStG).
   */
  readonly matchesProfile: boolean
  /**
   * From 2025: the date of the supply that passed the running year's limit. It and every later one are taxed, the
   * ones before stay tax-free (§ 19 Abs. 1 Satz 1 UStG). Null when no limit was passed in the year or before 2025.
   */
  readonly taxedFrom: string | null
}

/** The Hebesatz a trade tax was computed with: the user's correction, or the table by AGS and its year. */
export interface AppliedMultiplier {
  readonly percent: number
  readonly source: 'korrektur' | 'tabelle'
  readonly tableYear: number | null
  readonly note: string | null
}
