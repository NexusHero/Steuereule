/**
 * Two overview checks for the self-employed: the small business rule of the VAT act (§ 19 UStG)
 * and a rough trade tax with its credit against income tax (GewStG, § 35 EStG). Both are
 * overviews for advice, not the return: additions and deductions under §§ 8, 9 GewStG and the cap of
 * the § 35 credit at the income tax on the trade income are left to the owl to ask about.
 */

export interface SmallBusinessInput {
  readonly year: number
  /** Turnover of the year before, gross as § 19 Abs. 1 UStG counts it. */
  readonly priorYearTurnoverEur: number
  /** Up to 2024 the expected turnover of the year, from 2025 the actual one so far. */
  readonly currentYearTurnoverEur: number
  /**
   * The business started in this year: there is no year before, and the running year has the lower
   * limit. `monthsActive` counts begun months (Abschn. 19.1 Abs. 4 UStAE: until 2024 the turnover is
   * annualised over them).
   */
  readonly founding?: { readonly monthsActive: number } | undefined
  /**
   * The business started during the year before: until 2024 its turnover is annualised over the begun
   * months (§ 19 Abs. 3 Satz 3, 4 UStG a. F.); from 2025 the actual turnover counts (§ 19 n. F.).
   */
  readonly priorYearMonthsActive?: number | undefined
}

export interface SmallBusinessResult {
  readonly eligible: boolean
  readonly priorYearLimitEur: number
  readonly currentYearLimitEur: number
  /** Which limit is crossed, when one is. */
  readonly crossed: 'prior_year' | 'current_year' | null
}

/**
 * § 19 Abs. 1 UStG: from 2025 the turnover of the year before at most 25.000 € and of the running
 * year at most 100.000 € (crossing it ends the rule with that very turnover); up to 2024 22.000 €
 * and an expected 50.000 €.
 */
export function checkSmallBusiness(input: SmallBusinessInput): SmallBusinessResult {
  const fromNewRule = input.year >= 2025
  const priorYearLimitEur = fromNewRule ? 25_000 : 22_000
  if (input.founding) {
    // Founding year: only the running year counts, against the prior-year limit (§ 19 Abs. 2 UStG from
    // 2025, actual turnover; until 2024 the expected turnover, annualised, Abschn. 19.1 Abs. 4 UStAE).
    const months = Math.min(12, Math.max(1, Math.ceil(input.founding.monthsActive)))
    const turnover = fromNewRule ? input.currentYearTurnoverEur : (input.currentYearTurnoverEur * 12) / months
    const crossed = turnover > priorYearLimitEur ? 'current_year' : null
    return { eligible: crossed === null, priorYearLimitEur, currentYearLimitEur: priorYearLimitEur, crossed }
  }
  const currentYearLimitEur = fromNewRule ? 100_000 : 50_000
  const priorMonths = Math.min(12, Math.max(1, Math.ceil(input.priorYearMonthsActive ?? 12)))
  const prior = fromNewRule ? input.priorYearTurnoverEur : (input.priorYearTurnoverEur * 12) / priorMonths
  const crossed = prior > priorYearLimitEur ? 'prior_year' : input.currentYearTurnoverEur > currentYearLimitEur ? 'current_year' : null
  return { eligible: crossed === null, priorYearLimitEur, currentYearLimitEur, crossed }
}

/**
 * From 2025 the rule ends with the very turnover that passes the running year's limit (§ 19 Abs. 1 Satz 1 UStG:
 * „im laufenden Kalenderjahr 100 000 Euro nicht überschreitet“; in the founding year 25.000 €): the supplies before
 * it stay tax-free, that one and all after it are taxed (Abschn. 19.1 UStAE, BMF 18.03.2025). Returns the date of
 * the first taxed supply, or null. Up to 2024 the limit was a forecast at the start of the year: no cut.
 */
export function smallBusinessCutoff(input: { readonly year: number; readonly founding: boolean; readonly supplies: readonly { readonly date: string; readonly netEur: number }[] }): string | null {
  if (input.year < 2025) return null
  const limit = input.founding ? 25_000 : 100_000
  let sum = 0
  for (const s of [...input.supplies].sort((a, b) => a.date.localeCompare(b.date))) {
    sum += s.netEur
    if (sum > limit) return s.date
  }
  return null
}

/** § 16 Abs. 4 Satz 2 GewStG: 200 %, 280 % from EZ 2027 (§ 36 Abs. 5b GewStG, BGBl. 2026 I Nr. 197; statute read). */
export function minimumMultiplierPercent(year: number): number {
  return year >= 2027 ? 280 : 200
}

export const TRADE_TAX_ALLOWANCE_EUR = 24_500
export const TRADE_TAX_BASE_RATE = 0.035
export const TRADE_TAX_CREDIT_FACTOR = 4

export interface TradeTaxInput {
  readonly profitEur: number
  /** Additions (§ 8 GewStG) and deductions (§ 9) when known; 0 otherwise. */
  readonly additionsEur?: number | undefined
  readonly deductionsEur?: number | undefined
  /** The municipality's multiplier in percent (at least 200 %, 280 % from 2027). */
  readonly multiplierPercent: number
  /** The Erhebungszeitraum; without it the minimum of 2022–2026 applies. */
  readonly year?: number | undefined
  /** Sole traders and partnerships get the 24.500 € allowance, corporations not. */
  readonly personalCompany: boolean
}

export interface TradeTaxResult {
  readonly tradeIncomeEur: number
  readonly baseAmountEur: number
  readonly tradeTaxEur: number
  /** § 35 EStG: 4,0 × base amount, at most the trade tax; for sole traders and partnerships only. */
  readonly incomeTaxCreditEur: number
  readonly netBurdenEur: number
}

/**
 * Trade income rounded down to full 100 € (§ 11 Abs. 1 Satz 3 GewStG), less the allowance, times
 * 3,5 % gives the base amount (§ 11 Abs. 2), times the multiplier the tax (§ 16).
 */
export function estimateTradeTax(input: TradeTaxInput): TradeTaxResult {
  const minimum = minimumMultiplierPercent(input.year ?? 2026)
  if (!(input.multiplierPercent >= minimum)) throw new RangeError(`the multiplier is at least ${minimum} % (§ 16 Abs. 4 GewStG)`)
  const raw = input.profitEur + (input.additionsEur ?? 0) - (input.deductionsEur ?? 0)
  const tradeIncomeEur = Math.max(0, Math.floor(raw / 100) * 100)
  const afterAllowance = Math.max(0, tradeIncomeEur - (input.personalCompany ? TRADE_TAX_ALLOWANCE_EUR : 0))
  const baseAmountEur = Math.floor(afterAllowance * TRADE_TAX_BASE_RATE)
  const tradeTaxEur = Math.floor((baseAmountEur * input.multiplierPercent) / 100)
  const incomeTaxCreditEur = input.personalCompany ? Math.min(TRADE_TAX_CREDIT_FACTOR * baseAmountEur, tradeTaxEur) : 0
  return { tradeIncomeEur, baseAmountEur, tradeTaxEur, incomeTaxCreditEur, netBurdenEur: tradeTaxEur - incomeTaxCreditEur }
}
