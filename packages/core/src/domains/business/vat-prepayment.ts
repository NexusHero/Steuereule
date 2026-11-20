import type { VatRateKind } from './vat-annual'

/**
 * The Umsatzsteuer-Voranmeldung (§ 18 Abs. 1, 2, 2a UStG, §§ 46–48 UStDV) and the Zusammenfassende
 * Meldung (§ 18a UStG), ADR-0101 §22. The app computes and shows the Kennzahlen to type into Mein ELSTER;
 * it does not transmit. Sources: docs/research/selbststaendige-erweiterung.md §3, §4.
 */

export type VatFilingPeriod = 'monat' | 'quartal' | 'befreit'

/** § 18 Abs. 2 Satz 2, 3 and Abs. 2a: 7.500 € / 1.000 € until 2024, 9.000 € / 2.000 € from 2025. */
export function vatPeriodLimits(year: number): { readonly monthlyAboveEur: number; readonly exemptUpToEur: number } {
  return year >= 2025 ? { monthlyAboveEur: 9_000, exemptUpToEur: 2_000 } : { monthlyAboveEur: 7_500, exemptUpToEur: 1_000 }
}

export interface FilingPeriodInput {
  readonly year: number
  /** The VAT of the year before (Abschlusszahlung basis): positive owed, negative a refund. */
  readonly priorYearVatEur?: number | undefined
  /** Months the business was active in the year before, when it started then; the VAT is annualised. */
  readonly priorYearMonthsActive?: number | undefined
  /** The business starts this year: the expected VAT of the running year decides (Satz 6, 2021–2026). */
  readonly founding?: { readonly expectedVatEur: number } | undefined
  /** Abs. 2a: with a refund above the limit the business may choose the month. */
  readonly chooseMonthly?: boolean | undefined
}

/**
 * The period of the Voranmeldung. Satz 4 (founders monthly in their first two years) is suspended for
 * 2021–2026 (Satz 6): a founder takes the expected VAT of the year, a part year before is annualised.
 */
export function vatFilingPeriod(input: FilingPeriodInput): { readonly period: VatFilingPeriod; readonly reason: 'vorjahressteuer' | 'gruendung_schaetzung' | 'wahl_ueberschuss' } {
  const limits = vatPeriodLimits(input.year)
  if (input.founding) {
    const vat = input.founding.expectedVatEur
    return { period: vat > limits.monthlyAboveEur ? 'monat' : vat <= limits.exemptUpToEur ? 'befreit' : 'quartal', reason: 'gruendung_schaetzung' }
  }
  const months = Math.min(12, Math.max(1, Math.ceil(input.priorYearMonthsActive ?? 12)))
  const vat = ((input.priorYearVatEur ?? 0) * 12) / months
  if (vat < -limits.monthlyAboveEur && input.chooseMonthly) return { period: 'monat', reason: 'wahl_ueberschuss' }
  if (vat > limits.monthlyAboveEur) return { period: 'monat', reason: 'vorjahressteuer' }
  if (vat <= limits.exemptUpToEur && vat >= 0) return { period: 'befreit', reason: 'vorjahressteuer' }
  return { period: 'quartal', reason: 'vorjahressteuer' }
}

export interface VatPeriod {
  readonly label: string
  readonly from: string
  readonly to: string
  /** The 10th after the period, a month later with the Dauerfristverlängerung (§ 46 UStDV); before § 108 AO shifts. */
  readonly due: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

function dueAfter(year: number, month: number, extension: boolean): string {
  const m = month + (extension ? 2 : 1)
  const y = year + Math.floor((m - 1) / 12)
  return `${y}-${pad(((m - 1) % 12) + 1)}-10`
}

export function vatPeriodsOf(year: number, period: VatFilingPeriod, extension: boolean): readonly VatPeriod[] {
  if (period === 'befreit') return []
  const step = period === 'monat' ? 1 : 3
  const out: VatPeriod[] = []
  for (let start = 1; start <= 12; start += step) {
    const end = start + step - 1
    out.push({
      label: period === 'monat' ? `${pad(start)}/${year}` : `Q${(start + 2) / 3}/${year}`,
      from: `${year}-${pad(start)}-01`,
      to: `${year}-${pad(end)}-${pad(lastDay(year, end))}`,
      due: dueAfter(year, end, extension),
    })
  }
  return out
}

/**
 * § 47 UStDV: 1/11 of the prepayments of the year before (without the Sondervorauszahlung's deduction),
 * a part year annualised with begun months counted as full (Abs. 2). Only for monthly filers.
 */
export function specialPrepayment(input: { readonly priorYearPrepaymentsEur: number; readonly priorYearMonthsActive?: number | undefined }): number {
  const months = Math.min(12, Math.max(1, Math.ceil(input.priorYearMonthsActive ?? 12)))
  const annual = (Math.max(0, input.priorYearPrepaymentsEur) * 12) / months
  return Math.round(annual / 11)
}

export interface PeriodFigures {
  readonly taxableNetEur: Partial<Record<VatRateKind, number>>
  readonly intraEuAcquisitionNetEur: Partial<Record<VatRateKind, number>>
  /** § 13b Abs. 1 UStG: services of EU businesses. */
  readonly reverseChargeEuServicesNetEur: number
  /** § 13b Abs. 2 Nr. 1, 2, 4–12: the other cases (construction, foreign non-EU services …). */
  readonly reverseChargeOtherNetEur: number
  /** Intra-EU supplies to a buyer with a VAT id (Kz 41). */
  readonly taxFreeWithDeductionEur: number
  /** § 4 Nr. 8–29 UStG (Kz 48). */
  readonly taxFreeWithoutDeductionEur: number
  /** B2B services taxable in another member state (§ 18b Satz 1 Nr. 2, Kz 21). */
  readonly euServicesNetEur: number
  /** Input VAT from invoices (Kz 66). */
  readonly inputVatEur: number
}

export interface VatPeriodResult {
  /** Kennzahl → amount, only where there is one. */
  readonly kennzahlen: Readonly<Record<string, number>>
  /** Kz 83: positive to pay, negative a refund. */
  readonly vatDueEur: number
}

const cents = (v: number) => Math.round(v * 100) / 100
const STANDARD = 0.19
const REDUCED = 0.07

/**
 * The Kennzahlen of USt 1 A 2026 (Kz 81/86 taxable, 41 ig. Lieferungen, 21, 48, 89/93 ig. Erwerb,
 * 46/47 and 84/85 § 13b, 66/61/67 input VAT, 39 Sondervorauszahlung, 83). That 2022–2025 used the same
 * Kennzahlen could not be checked against the old forms (research §3); the help says so.
 */
export function vatPeriodReturn(input: { readonly figures: PeriodFigures; readonly regime: 'regel' | 'klein'; readonly specialPrepaymentDeductionEur?: number | undefined; readonly year?: number | undefined }): VatPeriodResult {
  // The Bemessungsgrundlagen are declared in whole euros (cents dropped), the tax on them with cents.
  const whole = (v: number | undefined) => Math.trunc(v ?? 0)
  const raw = input.figures
  const f: PeriodFigures = {
    ...raw,
    taxableNetEur: { standard: whole(raw.taxableNetEur.standard), reduced: whole(raw.taxableNetEur.reduced), zero: whole(raw.taxableNetEur.zero) },
    intraEuAcquisitionNetEur: { standard: whole(raw.intraEuAcquisitionNetEur.standard), reduced: whole(raw.intraEuAcquisitionNetEur.reduced) },
    reverseChargeEuServicesNetEur: whole(raw.reverseChargeEuServicesNetEur),
    reverseChargeOtherNetEur: whole(raw.reverseChargeOtherNetEur),
    taxFreeWithDeductionEur: whole(raw.taxFreeWithDeductionEur),
    taxFreeWithoutDeductionEur: whole(raw.taxFreeWithoutDeductionEur),
    euServicesNetEur: whole(raw.euServicesNetEur),
  }
  const k: Record<string, number> = {}
  const put = (kz: string, value: number) => {
    if (value !== 0) k[kz] = cents(value)
  }
  const small = input.regime === 'klein'
  const out19 = small ? 0 : (f.taxableNetEur.standard ?? 0) * STANDARD
  const out7 = small ? 0 : (f.taxableNetEur.reduced ?? 0) * REDUCED
  const ig19 = (f.intraEuAcquisitionNetEur.standard ?? 0) * STANDARD
  const ig7 = (f.intraEuAcquisitionNetEur.reduced ?? 0) * REDUCED
  const rcEu = f.reverseChargeEuServicesNetEur * STANDARD
  const rcOther = f.reverseChargeOtherNetEur * STANDARD
  if (!small) {
    put('81', f.taxableNetEur.standard ?? 0)
    put('86', f.taxableNetEur.reduced ?? 0)
    // 0 % for photovoltaic supplies (§ 12 Abs. 3 UStG): Kz 87 from the 2023 form on (verified).
    if ((input.year ?? 2026) >= 2023) put('87', f.taxableNetEur.zero ?? 0)
    put('41', f.taxFreeWithDeductionEur)
    put('48', f.taxFreeWithoutDeductionEur)
    put('21', f.euServicesNetEur)
  }
  put('89', f.intraEuAcquisitionNetEur.standard ?? 0)
  put('93', f.intraEuAcquisitionNetEur.reduced ?? 0)
  put('46', f.reverseChargeEuServicesNetEur)
  put('47', rcEu)
  put('84', f.reverseChargeOtherNetEur)
  put('85', rcOther)
  // A Kleinunternehmer deducts nothing (§ 19 Abs. 1 Satz 4 UStG).
  const input66 = small ? 0 : f.inputVatEur
  const input61 = small ? 0 : ig19 + ig7
  const input67 = small ? 0 : rcEu + rcOther
  put('66', input66)
  put('61', input61)
  put('67', input67)
  const deduction = Math.max(0, input.specialPrepaymentDeductionEur ?? 0)
  put('39', deduction)
  const due = cents(cents(out19) + cents(out7) + cents(ig19) + cents(ig7) + cents(rcEu) + cents(rcOther) - cents(input66) - cents(input61) - cents(input67) - deduction)
  k['83'] = due
  return { kennzahlen: k, vatDueEur: due }
}

/**
 * § 18a Abs. 1 Satz 2: the Zusammenfassende Meldung is quarterly while the intra-EU supplies of goods
 * stayed at or below 50.000 € in the running and in each of the four quarters before; otherwise monthly.
 * `goodsByQuarterEur` lists the running quarter first, then the four before it.
 */
export function ecSalesListPeriod(input: { readonly goodsByQuarterEur: readonly number[] }): 'monat' | 'quartal' {
  return input.goodsByQuarterEur.slice(0, 5).some((q) => q > 50_000) ? 'monat' : 'quartal'
}
