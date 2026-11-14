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
  const currentYearLimitEur = fromNewRule ? 100_000 : 50_000
  const crossed = input.priorYearTurnoverEur > priorYearLimitEur ? 'prior_year' : input.currentYearTurnoverEur > currentYearLimitEur ? 'current_year' : null
  return { eligible: crossed === null, priorYearLimitEur, currentYearLimitEur, crossed }
}

export const TRADE_TAX_ALLOWANCE_EUR = 24_500
export const TRADE_TAX_BASE_RATE = 0.035
export const TRADE_TAX_CREDIT_FACTOR = 4

export interface TradeTaxInput {
  readonly profitEur: number
  /** Additions (§ 8 GewStG) and deductions (§ 9) when known; 0 otherwise. */
  readonly additionsEur?: number | undefined
  readonly deductionsEur?: number | undefined
  /** The municipality's multiplier in percent (at least 200 %). */
  readonly multiplierPercent: number
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
  if (!(input.multiplierPercent >= 200)) throw new RangeError('the multiplier is at least 200 % (§ 16 Abs. 4 GewStG)')
  const raw = input.profitEur + (input.additionsEur ?? 0) - (input.deductionsEur ?? 0)
  const tradeIncomeEur = Math.max(0, Math.floor(raw / 100) * 100)
  const afterAllowance = Math.max(0, tradeIncomeEur - (input.personalCompany ? TRADE_TAX_ALLOWANCE_EUR : 0))
  const baseAmountEur = Math.floor(afterAllowance * TRADE_TAX_BASE_RATE)
  const tradeTaxEur = Math.floor((baseAmountEur * input.multiplierPercent) / 100)
  const incomeTaxCreditEur = input.personalCompany ? Math.min(TRADE_TAX_CREDIT_FACTOR * baseAmountEur, tradeTaxEur) : 0
  return { tradeIncomeEur, baseAmountEur, tradeTaxEur, incomeTaxCreditEur, netBurdenEur: tradeTaxEur - incomeTaxCreditEur }
}
