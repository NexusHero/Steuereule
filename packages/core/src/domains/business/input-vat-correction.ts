/**
 * The Vorsteuerberichtigung of § 15a UStG for an asset used more than once (Abs. 1, 5, 8, 9) with the limits of
 * § 44 UStDV and the period of § 45 UStDV. Sources: gesetze-im-internet.de/ustg_1980/__15a.html,
 * /ustdv_1980/__44.html, /ustdv_1980/__45.html (read 20.11.2026).
 *
 * The period runs five years from the first use, ten for land and buildings. It starts with the month of the
 * first use when that is before the 16th, otherwise with the next month (§ 45 UStDV, Abschn. 15a.3 Abs. 2 UStAE).
 * Each year of the period carries a fifth (a tenth) of the input VAT by its months. A change of the deductible
 * share against the original one corrects that year's part; a sale or Entnahme within the period counts as use at
 * the share of that turnover for the rest of the period (Abs. 8, 9). A move from the Kleinunternehmer rule to the
 * general one, or back, is such a change of the share.
 */

export interface InputVatCorrectionInput {
  /** The input VAT on the Anschaffungs- or Herstellungskosten. */
  readonly inputVatEur: number
  /** ISO date of the first use. */
  readonly firstUse: string
  /** Land and buildings: ten years (Abs. 1 Satz 2). */
  readonly realEstate: boolean
  /** The share of the input VAT originally deducted (0–1). */
  readonly originalShare: number
  /** The deductible share by calendar year as it turned out (0–1); a year not listed keeps the original share. */
  readonly shareByYear: Readonly<Record<number, number>>
  /** A sale or § 3 Abs. 1b Entnahme within the period; `share` is what that turnover would allow (1 taxable, 0 tax-free). */
  readonly disposal?: { readonly date: string; readonly share: number } | undefined
}

export interface InputVatCorrectionYear {
  readonly year: number
  /** Months of the period in the year. */
  readonly months: number
  /** Positive: more input VAT for the user; negative: to pay back. 0 where § 44 UStDV waives it. */
  readonly correctionEur: number
  /** § 44 Abs. 3 UStDV: above 6.000 € (or in the year of a sale) already in the Voranmeldung. */
  readonly inPrepayment: boolean
}

/** § 44 Abs. 1 UStDV: no correction up to 1.000 € of input VAT on the asset. */
export const CORRECTION_MIN_INPUT_VAT_EUR = 1_000
/** § 44 Abs. 2 UStDV: a change below 10 percentage points is waived unless the year's correction exceeds 1.000 €. */
const MIN_CHANGE = 0.1
const MIN_YEAR_CORRECTION_EUR = 1_000
/** § 44 Abs. 3 UStDV. */
const PREPAYMENT_ABOVE_EUR = 6_000

const cents = (v: number) => Math.round(v * 100) / 100
const clampShare = (v: number) => Math.min(1, Math.max(0, v))

function periodStart(firstUse: string): { year: number; month: number } {
  const year = Number(firstUse.slice(0, 4))
  const month = Number(firstUse.slice(5, 7))
  const day = Number(firstUse.slice(8, 10))
  if (day <= 15) return { year, month }
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
}

/** The correction of every calendar year of the period; an empty list when § 44 Abs. 1 UStDV waives it. */
export function inputVatCorrection(input: InputVatCorrectionInput): readonly InputVatCorrectionYear[] {
  if (input.inputVatEur <= CORRECTION_MIN_INPUT_VAT_EUR) return []
  const totalMonths = (input.realEstate ? 10 : 5) * 12
  const perMonth = input.inputVatEur / totalMonths
  const original = clampShare(input.originalShare)
  const start = periodStart(input.firstUse)
  const disposalIndex = input.disposal ? (Number(input.disposal.date.slice(0, 4)) - start.year) * 12 + Number(input.disposal.date.slice(5, 7)) - start.month : null

  const byYear = new Map<number, { months: number; delta: number; maxChange: number; disposal: boolean }>()
  for (let i = 0; i < totalMonths; i++) {
    const absolute = start.month - 1 + i
    const year = start.year + Math.floor(absolute / 12)
    // Abs. 9: from the month after the sale the asset counts as used at the sale's share.
    const afterDisposal = disposalIndex !== null && i > disposalIndex
    const share = afterDisposal ? clampShare(input.disposal!.share) : clampShare(input.shareByYear[year] ?? original)
    const row = byYear.get(year) ?? { months: 0, delta: 0, maxChange: 0, disposal: false }
    row.months += 1
    row.delta += perMonth * (share - original)
    row.maxChange = Math.max(row.maxChange, Math.abs(share - original))
    if (disposalIndex !== null && i === Math.max(0, disposalIndex + 1)) row.disposal = true
    byYear.set(year, row)
  }
  return [...byYear.entries()].map(([year, row]) => {
    const amount = cents(row.delta)
    const waived = !row.disposal && row.maxChange < MIN_CHANGE && Math.abs(amount) <= MIN_YEAR_CORRECTION_EUR
    const correctionEur = waived ? 0 : amount
    return { year, months: row.months, correctionEur, inPrepayment: correctionEur !== 0 && (row.disposal || Math.abs(correctionEur) > PREPAYMENT_ABOVE_EUR) }
  })
}
