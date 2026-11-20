import { applyLosses, type LossYearResult } from '../domains/business/losses'
import { tradeTaxCredit, type TradeTaxCreditPerson } from '../domains/business/trade-tax'
import type { SpecialTariffFacts } from '../domains/business/special-tariffs'

/**
 * Gewinneinkünfte of one person as the estimate takes them (ADR-0101): the profit of the Anlage S
 * and of the Anlage G each as its own Einkunftsart, both may be negative.
 */
export interface BusinessIncome {
  /** Einkünfte aus selbständiger Arbeit (§ 18 EStG, Anlage S). */
  readonly selfEmployedEur?: number | undefined
  /** Einkünfte aus Gewerbebetrieb (§ 15 EStG, Anlage G). */
  readonly tradeEur?: number | undefined
  /** Messbetrag and Gewerbesteuer of each trade (from `tradeTaxReturn`), for the § 35 EStG credit. */
  readonly tradeTax?: readonly { readonly baseAmountEur: number; readonly tradeTaxEur: number }[] | undefined
  /**
   * A § 16 gain (after the allowance, inside `tradeEur` or `selfEmployedEur`) and a § 34a retained profit
   * (ADR-0101 §22): taxed by § 34 or § 34a instead of the tariff.
   */
  readonly special?: SpecialTariffFacts | undefined
  /** The part of `tradeEur` that bears no trade tax (a sole trader's § 16 gain, § 7 Satz 2 GewStG): out of the § 35 numerator. */
  readonly tradeWithoutTradeTaxEur?: number | undefined
}

/** § 10d EStG facts of the year (see `applyLosses`). */
export interface LossCarry {
  /** Verbleibender Verlustvortrag from the last Feststellungsbescheid. */
  readonly carriedForwardEur?: number | undefined
  /** A later year's loss carried back into this year. */
  readonly carriedBackEur?: number | undefined
  /** In a loss year: what of this year's loss went back into the two years before. */
  readonly carriedBackOfThisLossEur?: number | undefined
}

/** ESt and Soli prepaid by Vorauszahlungsbescheid (§ 37 EStG), credited like the wage tax (§ 36 Abs. 2 Nr. 1). */
export interface Prepayments {
  readonly incomeTaxEur: number
  readonly soliEur?: number | undefined
}

export interface BusinessEstimate {
  readonly selfEmployedEur: number
  readonly tradeEur: number
  /** Gesamtbetrag der Einkünfte before § 10d; negative in a loss year. */
  readonly gdeEur: number
  readonly losses: LossYearResult
  /** The § 35 credit at both ends of the range (before § 35a, Soli measured after it). */
  readonly tradeTaxCredit: { readonly from: number; readonly to: number }
}

export const businessTotal = (b: BusinessIncome | undefined) => (b?.selfEmployedEur ?? 0) + (b?.tradeEur ?? 0)

export function lossesOfYear(year: number, joint: boolean, gdeEur: number, losses: LossCarry | undefined): LossYearResult {
  return applyLosses({
    year,
    joint,
    gdeEur,
    carriedForwardEur: losses?.carriedForwardEur ?? 0,
    carriedBackEur: losses?.carriedBackEur,
    carriedBackOfThisLossEur: losses?.carriedBackOfThisLossEur,
  })
}

/** One person for the § 35 ceiling: the business types plus the other Einkunftsarten of that person. */
export function creditPerson(business: BusinessIncome | undefined, otherTypesEur: readonly number[]): TradeTaxCreditPerson {
  return {
    income: {
      tradeEur: (business?.tradeEur ?? 0) - Math.max(0, business?.tradeWithoutTradeTaxEur ?? 0),
      tradeTypeTotalEur: business?.tradeEur ?? 0,
      otherTypesEur: [business?.selfEmployedEur ?? 0, ...otherTypesEur],
    },
    businesses: business?.tradeTax ?? [],
  }
}

/** The tariff tax after the § 35 credit; nothing to credit without a trade. */
export function afterTradeTaxCredit(persons: readonly TradeTaxCreditPerson[], tariffTaxEur: number): { readonly taxEur: number; readonly creditEur: number } {
  if (!persons.some((p) => p.businesses.length > 0 && p.income.tradeEur > 0)) return { taxEur: tariffTaxEur, creditEur: 0 }
  const { creditEur } = tradeTaxCredit(persons, tariffTaxEur)
  return { taxEur: Math.round((tariffTaxEur - creditEur) * 100) / 100, creditEur }
}
