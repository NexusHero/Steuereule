import { LOSS_CARRY_BACK_CAP_STEPS, LOSS_CARRY_FORWARD_RATE_STEPS, valueForYear } from '../../math/tax-parameters'
/**
 * Verlustabzug (§ 10d EStG): a negative Gesamtbetrag der Einkünfte goes back into the two years
 * before (Rücktrag), the rest forward (Vortrag) under the Mindestbesteuerung, and what is left at
 * year end is declared in a Feststellungsbescheid (§ 10d Abs. 4).
 */

export interface LossRules {
  /** § 10d Abs. 1 Satz 1: the most a loss may go back, single assessment; doubled for spouses. */
  readonly carryBackCapEur: number
  /** § 10d Abs. 1 Satz 1–2: into the year before, then the second year before (since VZ 2022). */
  readonly carryBackYears: 2
  /** § 10d Abs. 2 Satz 1: the Sockelbetrag deducted in full, single; doubled for spouses. */
  readonly forwardBaseEur: number
  /** § 10d Abs. 2 Satz 1: the share of the GdE above the Sockelbetrag that losses may still offset. */
  readonly forwardRate: number
}

/**
 * The rules by the loss year (Rücktrag) or the deduction year (Vortrag):
 * - Rücktrag 10 Mio. € (20 Mio. € joint) for losses of 2022 and 2023, two years back, Vierte Corona-
 *   Steuerhilfegesetz of 19.06.2022 (§ 52 Abs. 18b Satz 2 EStG); from 2024 1 Mio. € / 2 Mio. €, still two
 *   years (text in force since 1.1.2024).
 * - Vortrag: 1 Mio. € / 2 Mio. € in full, then 60 %; 70 % for VZ 2024–2027 (Wachstumschancengesetz of
 *   27.03.2024, § 52 Abs. 18b Satz 3 EStG).
 */
export function lossRules(year: number, joint: boolean): LossRules {
  const factor = joint ? 2 : 1
  return {
    carryBackCapEur: valueForYear(LOSS_CARRY_BACK_CAP_STEPS, year) * factor,
    carryBackYears: 2,
    forwardBaseEur: 1_000_000 * factor,
    forwardRate: valueForYear(LOSS_CARRY_FORWARD_RATE_STEPS, year),
  }
}

export interface CarryBackInput {
  readonly lossYear: number
  /** The negative Gesamtbetrag der Einkünfte of the loss year, as a positive amount. */
  readonly lossEur: number
  readonly joint: boolean
  /**
   * What the GdE of each earlier year still offers after the deductions already made there
   * (earlier Rücktrag, Verlustvortrag): [year before, second year before].
   */
  readonly roomEur: readonly [number, number]
  /**
   * § 10d Abs. 1 Satz 5 EStG: since VZ 2022 the user may only waive the Rücktrag as a whole; the
   * amount itself cannot be chosen any more (Vierte Corona-Steuerhilfegesetz).
   */
  readonly waive: boolean
}

export interface CarryBackResult {
  readonly intoYearBeforeEur: number
  readonly intoSecondYearBeforeEur: number
  /** What goes forward into the Feststellung. */
  readonly remainingEur: number
}

/**
 * The Rücktrag: first into the year before, then the second year before (§ 10d Abs. 1 Satz 1–2). The
 * cap is read as one cap for both years together; the act does not repeat the amount in Satz 2.
 */
export function carryBackLoss(input: CarryBackInput): CarryBackResult {
  const loss = Math.max(0, input.lossEur)
  if (input.waive) return { intoYearBeforeEur: 0, intoSecondYearBeforeEur: 0, remainingEur: loss }
  const capped = Math.min(loss, lossRules(input.lossYear, input.joint).carryBackCapEur)
  const intoYearBeforeEur = Math.min(capped, Math.max(0, input.roomEur[0]))
  const intoSecondYearBeforeEur = Math.min(capped - intoYearBeforeEur, Math.max(0, input.roomEur[1]))
  return { intoYearBeforeEur, intoSecondYearBeforeEur, remainingEur: loss - intoYearBeforeEur - intoSecondYearBeforeEur }
}

export interface LossYearInput {
  readonly year: number
  readonly joint: boolean
  /** Gesamtbetrag der Einkünfte of the year; negative in a loss year. */
  readonly gdeEur: number
  /** Verbleibender Verlustvortrag from the last Feststellungsbescheid (end of the year before). */
  readonly carriedForwardEur: number
  /** A loss of a later year carried back into this one (from `carryBackLoss`). */
  readonly carriedBackEur?: number | undefined
  /** In a loss year: the part of this year's loss that went back into earlier years. */
  readonly carriedBackOfThisLossEur?: number | undefined
}

export interface LossYearResult {
  readonly carryBackDeductedEur: number
  readonly carryForwardDeductedEur: number
  /** GdE after the Verlustabzug: what Sonderausgaben and the rest come off. */
  readonly gdeAfterLossesEur: number
  /** This year's loss (negative GdE as a positive amount); 0 in a profit year. */
  readonly newLossEur: number
  /** § 10d Abs. 4 Satz 2: verbleibender Verlustvortrag to be declared at the end of this year. */
  readonly remainingCarryForwardEur: number
}

/**
 * One year of § 10d. The carry-back from a later year comes off first, then the Vortrag under the
 * Mindestbesteuerung (Abs. 2 takes only what Abs. 1 did not), both before Sonderausgaben. The
 * Feststellung adds the loss of the year that did not go back and subtracts what the year used.
 */
export function applyLosses(input: LossYearInput): LossYearResult {
  const rules = lossRules(input.year, input.joint)
  const positive = Math.max(0, input.gdeEur)
  const carryBackDeductedEur = Math.min(positive, Math.max(0, input.carriedBackEur ?? 0))
  const afterBack = positive - carryBackDeductedEur
  const forwardRoom = Math.min(afterBack, rules.forwardBaseEur) + Math.max(0, afterBack - rules.forwardBaseEur) * rules.forwardRate
  const carryForwardDeductedEur = Math.floor(Math.min(Math.max(0, input.carriedForwardEur), forwardRoom))
  const newLossEur = Math.max(0, -input.gdeEur)
  const notCarriedBack = Math.max(0, newLossEur - Math.max(0, input.carriedBackOfThisLossEur ?? 0))
  return {
    carryBackDeductedEur,
    carryForwardDeductedEur,
    gdeAfterLossesEur: afterBack - carryForwardDeductedEur,
    newLossEur,
    remainingCarryForwardEur: Math.max(0, input.carriedForwardEur) - carryForwardDeductedEur + notCarriedBack,
  }
}
