/**
 * Umsatzsteuer-Jahreserklärung (§ 18 Abs. 3 UStG) for a business under the general rules, and the
 * § 13b tax a Kleinunternehmer still owes as recipient. The Voranmeldungen stay outside the app; the
 * user enters what he prepaid as one sum (ADR-0101 decision 8). Whether the small business rule
 * applies is `checkSmallBusiness` in `domains/business-taxes.ts`.
 */

/**
 * § 12 Abs. 1 and 2 UStG: 19 % and 7 % throughout 2022–2026; § 12 Abs. 3 UStG: 0 % for photovoltaic
 * systems up to 30 kWp from 2023 (Jahressteuergesetz 2022).
 */
export const VAT_RATES = { standard: 0.19, reduced: 0.07, zero: 0 } as const

export type VatRateKind = keyof typeof VAT_RATES

/**
 * Restaurant and catering services, drinks excluded (§ 12 Abs. 2 Nr. 15 UStG): 7 % from 1.7.2020 to
 * 31.12.2023 (Corona-Steuerhilfegesetz, extended twice), 19 % in 2024 and 2025, 7 % again and without
 * end date from 1.1.2026 (Steueränderungsgesetz 2025 of 22.12.2025, BGBl. 2025 I Nr. 363).
 */
export function restaurantFoodRate(serviceDate: string): VatRateKind {
  if (serviceDate >= '2020-07-01' && serviceDate <= '2023-12-31') return 'reduced'
  return serviceDate >= '2026-01-01' ? 'reduced' : 'standard'
}

/**
 * Gas and district heating (§ 28 Abs. 5 UStG): 7 % from 1.10.2022 to 31.3.2024 (Gesetz zur temporären
 * Senkung des Umsatzsteuersatzes auf Gaslieferungen über das Erdgasnetz of 19.10.2022).
 */
export function gasSupplyRate(supplyDate: string): VatRateKind {
  return supplyDate >= '2022-10-01' && supplyDate <= '2024-03-31' ? 'reduced' : 'standard'
}

export type VatMethod = 'soll' | 'ist'

/**
 * § 20 Satz 1 UStG: Istversteuerung on application up to a Gesamtumsatz of the year before of
 * 800.000 € from 2024 (Wachstumschancengesetz), 600.000 € before (Nr. 1); for a business freed from keeping books
 * under § 148 AO (Nr. 2); for a freelance activity regardless of turnover (Nr. 3). Nr. 4 is for public bodies,
 * never a person using the app. Returns whether the office may grant it.
 */
export function cashAccountingAllowed(year: number, priorYearTotalTurnoverEur: number, freelance: boolean, exemptFromBookkeeping = false): boolean {
  if (freelance || exemptFromBookkeeping) return true
  return priorYearTotalTurnoverEur <= (year >= 2024 ? 800_000 : 600_000)
}

export type NetByRate = Partial<Record<VatRateKind, number>>

export interface VatAnnualInput {
  readonly year: number
  /** Soll: by agreed fees; Ist: by fees received (§ 13 Abs. 1 Nr. 1 a and b UStG). The amounts below follow it. */
  readonly method: VatMethod
  /** 'klein': § 19 UStG applies; only § 13b tax is owed and nothing is deducted (§ 19 Abs. 1 Satz 4 UStG until 2024, § 15 Abs. 2 Satz 1 Nr. 1 UStG from 2025). */
  readonly regime: 'regel' | 'klein'
  /** Taxable net turnover by rate, including unentgeltliche Wertabgaben (§ 3 Abs. 1b, 9a UStG). */
  readonly taxableNetEur: NetByRate
  /** Tax free with input tax deduction: exports and intra-EU supplies (§ 4 Nr. 1 UStG). */
  readonly taxFreeWithDeductionEur?: number | undefined
  /** Tax free without deduction: § 4 Nr. 8–29 UStG (doctors, insurance, letting …). */
  readonly taxFreeWithoutDeductionEur?: number | undefined
  /** § 13b UStG: net fees for services received where the user owes the tax as recipient. */
  readonly reverseChargeNetEur?: NetByRate | undefined
  /** Input tax from invoices (§ 15 Abs. 1 Satz 1 Nr. 1 UStG), already reduced for private use. */
  readonly inputVatEur: number
  /** The prepayments of the year as the user paid them (sum of the Voranmeldungen and Sondervorauszahlung). */
  readonly prepaymentsEur: number
  /** The Vorsteuerberichtigung of the year (§ 15a UStG): positive more input tax, negative to pay back. */
  readonly inputVatCorrectionEur?: number | undefined
}

export interface VatAnnualResult {
  readonly outputVat: Readonly<Record<VatRateKind, number>>
  readonly reverseChargeVatEur: number
  readonly inputVatDeductibleEur: number
  /** The § 15a correction inside `vatOfYearEur`. */
  readonly inputVatCorrectionEur: number
  /** Umsatzsteuer of the year (verbleibende Umsatzsteuer before the prepayments). */
  readonly vatOfYearEur: number
  readonly prepaymentsEur: number
  /** Positive = Nachzahlung (Abschlusszahlung), negative = Erstattung. */
  readonly balanceEur: number
}

const cents = (value: number) => Math.round(value * 100) / 100

function taxByRate(net: NetByRate | undefined): Record<VatRateKind, number> {
  return {
    standard: cents((net?.standard ?? 0) * VAT_RATES.standard),
    reduced: cents((net?.reduced ?? 0) * VAT_RATES.reduced),
    zero: 0,
  }
}

/**
 * The annual return: output tax by rate on the net turnover, plus the § 13b tax as recipient, less
 * the input tax. The § 13b tax is deductible again as input tax (§ 15 Abs. 1 Satz 1 Nr. 4 UStG) when
 * the business may deduct at all; a Kleinunternehmer may not (§ 19 Abs. 1 Satz 4 UStG until 2024, § 15 Abs. 2 Satz 1 Nr. 1 UStG from 2025).
 * Turnover without deduction does not cut input tax here: the caller enters only deductible input
 * tax (§ 15 Abs. 2 and 4 UStG need the split per invoice, which the bookkeeping holds).
 */
export function vatAnnualReturn(input: VatAnnualInput): VatAnnualResult {
  if (!(input.year >= 2022 && input.year <= 2026)) throw new RangeError('the VAT return covers 2022–2026')
  const small = input.regime === 'klein'
  const outputVat = small ? { standard: 0, reduced: 0, zero: 0 } : taxByRate(input.taxableNetEur)
  const reverse = taxByRate(input.reverseChargeNetEur)
  const reverseChargeVatEur = cents(reverse.standard + reverse.reduced)
  const inputVatDeductibleEur = small ? 0 : cents(input.inputVatEur + reverseChargeVatEur)
  // § 15a also binds a Kleinunternehmer: a move to or from § 19 is a change of the deductible share.
  const inputVatCorrectionEur = cents(input.inputVatCorrectionEur ?? 0)
  const vatOfYearEur = cents(outputVat.standard + outputVat.reduced + reverseChargeVatEur - inputVatDeductibleEur - inputVatCorrectionEur)
  return {
    outputVat,
    reverseChargeVatEur,
    inputVatDeductibleEur,
    inputVatCorrectionEur,
    vatOfYearEur,
    prepaymentsEur: input.prepaymentsEur,
    balanceEur: cents(vatOfYearEur - input.prepaymentsEur),
  }
}
