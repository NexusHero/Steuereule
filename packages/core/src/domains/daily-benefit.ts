// A daily benefit in the Swiss gross wage (Lohnausweis Ziffer 8) of a cross-border commuter is treated by
// where the money came from (ADR-0072, Punkt 5):
// - the employer's collective sickness daily-benefit insurance, received by the employer and offset in the
//   wage („KK-Taggeld Verrechnung“): tax-free, no progression clause (FG Baden-Württemberg 08.05.2019,
//   14 K 1955/18 and 14 K 2647/18), deducted in the sickness field;
// - the employer's own continued pay without an insurance (Lohnfortzahlung, Art. 324a OR): wage, nothing
//   to deduct;
// - both: only the insurer's part is deducted, the employer's top-up stays wage;
// - the accident insurance (UVG/SUVA): tax-free with the progression clause, its own field;
// - maternity (EO) and IV benefits: their own N-Gre line is not printed yet, so they stay in the sickness
//   field for now;
// - no daily benefit (also a private insurance that paid the employee directly): nothing to deduct.
// Benefits of an insurance are not AHV wage, wage is: `ahvContributionFit` turns that into a hint, never a decision.
import { formatChf } from '../common/format'
import { isSupportedIncomeTaxYear } from '../math/tarif'
import { getTaxYearParameters } from '../math/tax-parameters'

/** The answers of the one question „Woher kam das Taggeld im Bruttolohn?“, stored as `taggeldQuelle`. */
export const DAILY_BENEFIT_SOURCES = ['krankentaggeldversicherung', 'lohnfortzahlung', 'beides', 'unfallversicherung', 'mutterschaftIv', 'kein'] as const
export type DailyBenefitSource = (typeof DAILY_BENEFIT_SOURCES)[number]

/** The answers as the owl, the MCP assistant and the mask name them. */
export const DAILY_BENEFIT_SOURCE_LABELS: Readonly<Record<DailyBenefitSource, string>> = {
  krankentaggeldversicherung: 'Krankentaggeldversicherung (mit dem Lohn verrechnet)',
  lohnfortzahlung: 'Lohnfortzahlung des Arbeitgebers ohne Versicherung',
  beides: 'beides (Versicherung zahlt einen Teil, der Arbeitgeber stockt auf)',
  unfallversicherung: 'Unfallversicherung (UVG/SUVA)',
  mutterschaftIv: 'Mutterschaft / IV',
  kein: 'kein Taggeld',
}

export function isDailyBenefitSource(value: string | null | undefined): value is DailyBenefitSource {
  return (DAILY_BENEFIT_SOURCES as readonly string[]).includes(value ?? '')
}

export type DailyBenefitAmountField = 'steuerfreiesKrankentaggeldChf' | 'steuerfreiesUnfalltaggeldChf'

/** The field the deducted amount goes to; null when nothing is deducted (the money is wage, or there is none). */
export function dailyBenefitAmountField(source: DailyBenefitSource): DailyBenefitAmountField | null {
  switch (source) {
    case 'krankentaggeldversicherung':
    case 'beides':
    case 'mutterschaftIv':
      return 'steuerfreiesKrankentaggeldChf'
    case 'unfallversicherung':
      return 'steuerfreiesUnfalltaggeldChf'
    case 'lohnfortzahlung':
    case 'kein':
      return null
  }
}

/** The answer and the two amount fields as they are stored for it; `null` clears a field that does not fit. */
export interface DailyBenefitEntry {
  readonly taggeldQuelle: DailyBenefitSource
  readonly steuerfreiesKrankentaggeldChf: number | null
  readonly steuerfreiesUnfalltaggeldChf: number | null
}

/**
 * What the answer writes. `amountChf` is the paid-out benefit, for „beides“ the insurer's part only; it is
 * ignored where nothing is deducted (continued pay is wage: the sickness field holds 0). A field that does
 * not fit the answer is cleared, so a changed answer leaves no amount behind that would still be deducted.
 */
export function dailyBenefitEntry(source: DailyBenefitSource, amountChf: number | null): DailyBenefitEntry {
  const field = dailyBenefitAmountField(source)
  if (field === null) return { taggeldQuelle: source, steuerfreiesKrankentaggeldChf: 0, steuerfreiesUnfalltaggeldChf: null }
  return {
    taggeldQuelle: source,
    steuerfreiesKrankentaggeldChf: field === 'steuerfreiesKrankentaggeldChf' ? amountChf : null,
    steuerfreiesUnfalltaggeldChf: field === 'steuerfreiesUnfalltaggeldChf' ? amountChf : null,
  }
}

export interface AhvContributionFitInput {
  readonly taxYear: number
  /** Lohnausweis Ziffer 8. */
  readonly grossWageChf: number
  /** Lohnausweis Ziffer 9: AHV/IV/EO and ALV, possibly with the employee's NBU premium. */
  readonly ahvContributionsChf: number
  /** The daily benefit whose source is in question. */
  readonly candidateChf: number
  /** Family allowances in Ziffer 8: not AHV wage either. */
  readonly familyAllowancesChf?: number | undefined
}

export type AhvContributionFitVerdict = 'with' | 'without' | 'unclear'

export interface AhvContributionFit {
  /** `with`: Ziffer 9 fits the gross wage with the benefit as AHV wage (wage); `without`: without it (insurance). */
  readonly verdict: AhvContributionFitVerdict
  readonly reason: 'fits_with' | 'fits_without' | 'too_close' | 'nbu_likely' | 'fits_neither'
  readonly ahvContributionsChf: number
  readonly expectedWithChf: number
  readonly expectedWithoutChf: number
  /** Ziffer 9 minus the expected contributions. */
  readonly deviationWithChf: number
  readonly deviationWithoutChf: number
  /** By how much the better fit is closer than the other. */
  readonly marginChf: number
  readonly toleranceChf: number
}

/** Rounding over the year's payslips and small items make a few francs; 1 % of the contributions, at least 25 CHF. */
const TOLERANCE_SHARE = 0.01
const MIN_TOLERANCE_CHF = 25

/**
 * Whether the contributions of Ziffer 9 fit the gross wage with the benefit or without it, by the employee
 * rates of the year. A plausibility hint only: Ziffer 9 can hold the NBU premium as well, and other items
 * of Ziffer 8 may not be AHV wage. Null for a year without parameters.
 */
export function ahvContributionFit(input: AhvContributionFitInput): AhvContributionFit | null {
  if (!isSupportedIncomeTaxYear(input.taxYear)) return null
  const rates = getTaxYearParameters(input.taxYear).swissSocialSecurity
  const expected = (ahvWage: number): number => {
    const wage = Math.max(0, ahvWage)
    return Math.round(wage * rates.ahvIvEoEmployeeRate + Math.min(wage, rates.alvMaxWageChf) * rates.alvEmployeeRate + Math.max(0, wage - rates.alvMaxWageChf) * rates.alvSolidarityRate)
  }
  const ahvWage = input.grossWageChf - (input.familyAllowancesChf ?? 0)
  const expectedWithChf = expected(ahvWage)
  const expectedWithoutChf = expected(ahvWage - input.candidateChf)
  const deviationWithChf = input.ahvContributionsChf - expectedWithChf
  const deviationWithoutChf = input.ahvContributionsChf - expectedWithoutChf
  const marginChf = Math.abs(Math.abs(deviationWithChf) - Math.abs(deviationWithoutChf))
  const toleranceChf = Math.max(MIN_TOLERANCE_CHF, Math.round(expectedWithChf * TOLERANCE_SHARE))
  const base = { ahvContributionsChf: input.ahvContributionsChf, expectedWithChf, expectedWithoutChf, deviationWithChf, deviationWithoutChf, marginChf, toleranceChf }
  if (deviationWithChf > toleranceChf) return { ...base, verdict: 'unclear', reason: 'nbu_likely' }
  if (deviationWithoutChf < -toleranceChf) return { ...base, verdict: 'unclear', reason: 'fits_neither' }
  if (marginChf < toleranceChf || expectedWithChf - expectedWithoutChf < toleranceChf) return { ...base, verdict: 'unclear', reason: 'too_close' }
  return Math.abs(deviationWithChf) < Math.abs(deviationWithoutChf) ? { ...base, verdict: 'with', reason: 'fits_with' } : { ...base, verdict: 'without', reason: 'fits_without' }
}

const NBU_NOTE = 'Ziffer 9 kann auch die NBU-Prämie enthalten; entscheidend ist die Taggeld-Abrechnung.'

/** The hint in German for the owl, the MCP assistant and the question texts; it never decides. */
export function ahvContributionFitHint(fit: AhvContributionFit): string {
  const box9 = formatChf(fit.ahvContributionsChf)
  const withText = formatChf(fit.expectedWithChf)
  const withoutText = formatChf(fit.expectedWithoutChf)
  const lead = 'Hinweis zur Plausibilität (keine Entscheidung):'
  switch (fit.reason) {
    case 'fits_without':
      return `${lead} Die Beiträge in Ziffer 9 (${box9}) passen besser zum Bruttolohn ohne das Taggeld (AHV/IV/EO und ALV etwa ${withoutText}) als mit dem Taggeld (etwa ${withText}), um ${formatChf(fit.marginChf)}. Das spricht für eine Versicherungsleistung: Das Taggeld einer Versicherung ist kein AHV-pflichtiger Lohn. ${NBU_NOTE}`
    case 'fits_with':
      return `${lead} Die Beiträge in Ziffer 9 (${box9}) passen besser zum Bruttolohn mit dem Taggeld (AHV/IV/EO und ALV etwa ${withText}) als ohne das Taggeld (etwa ${withoutText}), um ${formatChf(fit.marginChf)}. Das spricht dafür, dass das Geld als AHV-pflichtiger Lohn gezahlt wurde, also als Lohnfortzahlung des Arbeitgebers. ${NBU_NOTE}`
    case 'too_close':
      return `${lead} Mit und ohne das Taggeld ergäben sich fast dieselben Beiträge in Ziffer 9 (etwa ${withText} und ${withoutText}); daran lässt sich die Herkunft nicht unterscheiden.`
    case 'nbu_likely':
      return `${lead} Ziffer 9 (${box9}) enthält mehr als AHV/IV/EO und ALV auf den ganzen Bruttolohn (etwa ${withText}), wahrscheinlich auch die NBU-Prämie; daran lässt sich die Herkunft des Taggelds nicht ablesen.`
    case 'fits_neither':
      return `${lead} Ziffer 9 (${box9}) liegt deutlich unter den Beiträgen mit dem Taggeld (etwa ${withText}) und ohne das Taggeld (etwa ${withoutText}); daran lässt sich die Herkunft nicht ablesen.`
  }
}

/**
 * The source the app recommends: only when two signs of the certificate agree, the remark naming a paid-out
 * benefit („KK-Taggeld Verrechnung“) and Ziffer 9 fitting the gross wage without it (a benefit of an
 * insurance is not AHV wage). The user still answers; null when a sign is missing or they disagree.
 */
export function recommendedDailyBenefitSource(remarkKind: 'sickness' | 'accident' | null | undefined, fit: AhvContributionFit | null): DailyBenefitSource | null {
  if (!remarkKind || fit === null || fit.verdict !== 'without') return null
  return remarkKind === 'accident' ? 'unfallversicherung' : 'krankentaggeldversicherung'
}

/** An answer that keeps the benefit as wage although both signs point to an insurance. */
export function goesAgainstRecommendation(answer: DailyBenefitSource, recommended: DailyBenefitSource | null): boolean {
  return recommended !== null && (answer === 'lohnfortzahlung' || answer === 'kein')
}

/** Why the app recommends the deduction, in German, for the question, the card and the mask. */
export const DAILY_BENEFIT_RECOMMENDATION_REASON =
  'Die Bemerkung im Lohnausweis nennt das Taggeld, und die AHV-Beiträge in Ziffer 9 passen zum Lohn ohne das Taggeld: Beides spricht für eine Versicherungsleistung, die steuerfrei ist.'

/** The warning beside an answer against the recommendation. */
export const DAILY_BENEFIT_CONTRADICTION =
  'Das widerspricht dem Lohnausweis: Bemerkung und Ziffer 9 sprechen für eine Versicherungsleistung. Wähle Lohnfortzahlung nur, wenn die Taggeld-Abrechnung oder die Monatslohnabrechnungen das zeigen (AHV-pflichtiger Lohn des Arbeitgebers); sonst wird steuerfreies Geld versteuert.'
