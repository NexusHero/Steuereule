import { minimumMultiplierPercent, TRADE_TAX_ALLOWANCE_EUR, TRADE_TAX_BASE_RATE, TRADE_TAX_CREDIT_FACTOR } from '../business-taxes'
import { appliesFrom } from '../../math/tax-parameters'

/**
 * Gewerbesteuer of a sole trader for one Erhebungszeitraum, as the Gewerbesteuererklärung and the
 * Messbescheid compute it, and the § 35 EStG credit against income tax. `estimateTradeTax` in
 * `domains/business-taxes.ts` stays the owl's quick overview; this is the return.
 */

/** The financing components of § 8 Nr. 1 GewStG, as the business paid them in the year. */
export interface FinancingComponents {
  /** a) Entgelte für Schulden (interest and the like), in full. */
  readonly debtChargesEur?: number | undefined
  /** b) Renten und dauernde Lasten, in full. */
  readonly annuitiesEur?: number | undefined
  /** c) Gewinnanteile stiller Gesellschafter, in full. */
  readonly silentPartnerSharesEur?: number | undefined
  /** d) Rent and leasing for movable assets: one fifth. */
  readonly rentMovableEur?: number | undefined
  /** d) the same for electric and qualifying hybrid vehicles and bicycles: half of one fifth. */
  readonly rentMovableLowEmissionEur?: number | undefined
  /** e) Rent and leasing for immovable assets: one half. */
  readonly rentImmovableEur?: number | undefined
  /** f) Licences and concessions for a limited time: one quarter. */
  readonly licencesEur?: number | undefined
}

/** § 8 Nr. 1 GewStG: the allowance of 200.000 € on the sum of the components (since EZ 2020). */
export const FINANCING_ALLOWANCE_EUR = 200_000

export interface FinancingAddition {
  readonly componentsEur: number
  /** One quarter of what exceeds 200.000 €. */
  readonly additionEur: number
}

/**
 * § 8 Nr. 1 GewStG: one quarter of the sum of a) to f), as far as the sum exceeds 200.000 €. The
 * components enter at 100 %, d) at 1/5 (1/10 for low-emission vehicles), e) at 1/2, f) at 1/4.
 */
export function financingAddition(c: FinancingComponents): FinancingAddition {
  const v = (x: number | undefined) => Math.max(0, x ?? 0)
  const componentsEur = cents(
    v(c.debtChargesEur) +
      v(c.annuitiesEur) +
      v(c.silentPartnerSharesEur) +
      v(c.rentMovableEur) / 5 +
      v(c.rentMovableLowEmissionEur) / 10 +
      v(c.rentImmovableEur) / 2 +
      v(c.licencesEur) / 4,
  )
  return { componentsEur, additionEur: cents(Math.max(0, componentsEur - FINANCING_ALLOWANCE_EUR) / 4) }
}

/**
 * § 9 Nr. 1 Satz 1 GewStG for the land in business assets: until EZ 2024 1,2 % of 140 % of the
 * Einheitswert (§ 121a BewG); from EZ 2025 the Grundsteuer booked as expense in the year (version of
 * the Jahressteuergesetz 2024 of 2.12.2024, § 36 Abs. 4b Satz 1 GewStG).
 */
export function landDeduction(year: number, basis: { readonly einheitswertEur?: number | undefined; readonly landTaxEur?: number | undefined }): number {
  if (appliesFrom('tradeTaxLandDeductionByLandTax', year)) return cents(Math.max(0, basis.landTaxEur ?? 0))
  return cents(Math.max(0, basis.einheitswertEur ?? 0) * 1.4 * 0.012)
}

export interface TradeTaxReturnInput {
  readonly year: number
  /** The profit as the income tax computes it (§ 7 GewStG), may be negative. */
  readonly profitEur: number
  readonly financing?: FinancingComponents | undefined
  /** Further additions of § 8 Nr. 4–12 GewStG, already computed. */
  readonly otherAdditionsEur?: number | undefined
  /** § 9 Nr. 1 GewStG, see `landDeduction`. */
  readonly landDeductionEur?: number | undefined
  /** Further deductions of § 9 Nr. 2–10 GewStG. */
  readonly otherDeductionsEur?: number | undefined
  /** Vortragsfähiger Gewerbeverlust from the last Feststellungsbescheid (§ 10a GewStG). */
  readonly lossCarriedForwardEur?: number | undefined
  /** The municipality's Hebesatz in percent (at least `minimumMultiplierPercent`, § 16 Abs. 4 Satz 2 GewStG). */
  readonly multiplierPercent: number
}

export interface TradeTaxReturn {
  readonly additionsEur: number
  readonly deductionsEur: number
  /** Gewinn + Hinzurechnungen − Kürzungen, before the loss. */
  readonly tradeIncomeBeforeLossEur: number
  readonly lossUsedEur: number
  /** To be declared at year end (§ 10a Satz 6 GewStG): the old rest plus a new negative trade income. */
  readonly lossRemainingEur: number
  readonly roundedTradeIncomeEur: number
  readonly allowanceEur: number
  /** Steuermessbetrag (§ 11, § 14 GewStG), whole euros. */
  readonly baseAmountEur: number
  readonly multiplierPercent: number
  readonly tradeTaxEur: number
}

/** § 10a GewStG: up to 1 Mio. € in full, above that 60 % of the trade income. */
export const TRADE_LOSS_BASE_EUR = 1_000_000
export const TRADE_LOSS_RATE = 0.6

/**
 * Gewinn + Hinzurechnungen (§ 8) − Kürzungen (§ 9) = Gewerbeertrag; less the Gewerbeverlust (§ 10a);
 * rounded down to full 100 € and less the allowance of 24.500 €, at most the rounded income
 * (§ 11 Abs. 1 Satz 3 Nr. 1 GewStG); times 3,5 % (§ 11 Abs. 2) = Messbetrag, rounded down to whole
 * euros (R 14.1 Satz 3 GewStR); times the Hebesatz = Gewerbesteuer (§ 16 Abs. 1 GewStG), to the cent.
 */
export function tradeTaxReturn(input: TradeTaxReturnInput): TradeTaxReturn {
  const minimum = minimumMultiplierPercent(input.year)
  if (!(input.multiplierPercent >= minimum)) throw new RangeError(`the multiplier is at least ${minimum} % (§ 16 Abs. 4 GewStG)`)
  const additionsEur = cents(financingAddition(input.financing ?? {}).additionEur + Math.max(0, input.otherAdditionsEur ?? 0))
  const deductionsEur = cents(Math.max(0, input.landDeductionEur ?? 0) + Math.max(0, input.otherDeductionsEur ?? 0))
  const tradeIncomeBeforeLossEur = cents(input.profitEur + additionsEur - deductionsEur)
  const carried = Math.max(0, input.lossCarriedForwardEur ?? 0)
  const positive = Math.max(0, tradeIncomeBeforeLossEur)
  const usable = Math.min(positive, TRADE_LOSS_BASE_EUR) + Math.max(0, positive - TRADE_LOSS_BASE_EUR) * TRADE_LOSS_RATE
  const lossUsedEur = cents(Math.min(carried, usable))
  const lossRemainingEur = cents(carried - lossUsedEur + Math.max(0, -tradeIncomeBeforeLossEur))
  const roundedTradeIncomeEur = Math.max(0, Math.floor((positive - lossUsedEur) / 100) * 100)
  const allowanceEur = Math.min(TRADE_TAX_ALLOWANCE_EUR, roundedTradeIncomeEur)
  // In tenths of a percent the product stays an integer, so 3,5 % of 55.500 € is 1.942,5 € and not a float above it.
  const baseAmountEur = Math.floor(((roundedTradeIncomeEur - allowanceEur) * Math.round(TRADE_TAX_BASE_RATE * 1000)) / 1000)
  return {
    additionsEur,
    deductionsEur,
    tradeIncomeBeforeLossEur,
    lossUsedEur,
    lossRemainingEur,
    roundedTradeIncomeEur,
    allowanceEur,
    baseAmountEur,
    multiplierPercent: input.multiplierPercent,
    tradeTaxEur: cents((baseAmountEur * input.multiplierPercent) / 100),
  }
}

/** One person's incomes for the § 35 ceiling: the Summe der Einkünfte of each Einkunftsart (after horizontal offset). */
export interface IncomeByType {
  /** § 15 EStG income that bears trade tax and § 35 counts. */
  readonly tradeEur: number
  /**
   * The whole Einkunftsart Gewerbebetrieb when it holds more than `tradeEur` (§ 17 gains, income
   * outside § 35): it counts in the denominator only (Rn. 16 of the BMF letter). Default `tradeEur`.
   */
  readonly tradeTypeTotalEur?: number | undefined
  /** Every other Einkunftsart, each its own sum (§§ 13, 18, 19, 20, 21, 22, 23). */
  readonly otherTypesEur: readonly number[]
}

export interface TradeTaxCreditPerson {
  readonly income: IncomeByType
  /** The Messbeträge and the trade tax due of the person's businesses. */
  readonly businesses: readonly { readonly baseAmountEur: number; readonly tradeTaxEur: number }[]
}

export interface TradeTaxCredit {
  /** 4,0 × Messbetrag, each business capped at its trade tax (Rn. 9 of the BMF letter). */
  readonly creditVolumeEur: number
  /** The income tax share of the trade income (§ 35 Abs. 1 Satz 2 EStG). */
  readonly ceilingEur: number
  readonly creditEur: number
}

/**
 * § 35 EStG: the Ermäßigung is 4,0 × Messbetrag (since VZ 2020; 3,8 before), capped by the trade tax
 * actually due (Satz 5) and by the Ermäßigungshöchstbetrag:
 * Summe der positiven gewerblichen Einkünfte ÷ Summe aller positiven Einkünfte × geminderte tarifliche
 * Steuer (Satz 2). BMF 3.11.2016 (IV C 6 - S 2296-a/08/10002-003, BStBl I S. 1187), amended by BMF
 * 17.04.2019 (IV C 6 - S 2296-a/17/10004): positive means the sum per Einkunftsart after horizontal
 * but no vertical offset (Rn. 16); for spouses positivity is checked per spouse (Rn. 16) and the credit
 * volume of a spouse without positive trade income drops out (Rn. 10).
 * `reducedTariffTaxEur` is the tariff tax less foreign taxes credited (Rn. 4); § 35a comes after.
 */
export function tradeTaxCredit(persons: readonly TradeTaxCreditPerson[], reducedTariffTaxEur: number): TradeTaxCredit {
  const positiveTrade = persons.reduce((sum, p) => sum + Math.max(0, p.income.tradeEur), 0)
  const positiveAll = persons.reduce((sum, p) => sum + Math.max(0, p.income.tradeTypeTotalEur ?? p.income.tradeEur) + p.income.otherTypesEur.reduce((s, x) => s + Math.max(0, x), 0), 0)
  const creditVolumeEur = cents(
    persons
      .filter((p) => p.income.tradeEur > 0)
      .flatMap((p) => p.businesses)
      .reduce((sum, b) => sum + Math.min(TRADE_TAX_CREDIT_FACTOR * b.baseAmountEur, Math.max(0, b.tradeTaxEur)), 0),
  )
  const ceilingEur = positiveAll > 0 ? floorCents((positiveTrade / positiveAll) * Math.max(0, reducedTariffTaxEur)) : 0
  return { creditVolumeEur, ceilingEur, creditEur: Math.min(creditVolumeEur, ceilingEur) }
}

const cents = (value: number) => Math.round(value * 100) / 100
const floorCents = (value: number) => Math.floor(Math.round(value * 1000) / 10) / 100
