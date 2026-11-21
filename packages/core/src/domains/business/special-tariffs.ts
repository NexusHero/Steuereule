/**
 * Special tariffs of Gewinneinkünfte (ADR-0101 §22): the gain on selling or giving up the business
 * (§ 16 EStG) with the Fünftelregelung or the reduced rate (§ 34 Abs. 1, 3 EStG), and the retained
 * profit of a Bilanzierer (Thesaurierung, § 34a EStG). Sources: docs/research/selbststaendige-erweiterung.md §6, §7.
 */

/** § 16 Abs. 4 EStG: 45.000 € once in a life from age 55 or permanently unable to work, less what the gain exceeds 136.000 €. */
export const DISPOSAL_ALLOWANCE_EUR = 45_000
export const DISPOSAL_ALLOWANCE_THRESHOLD_EUR = 136_000

export interface DisposalInput {
  /** Veräußerungspreis, or for an Aufgabe the gemeiner Wert of the assets and the proceeds of their sale. */
  readonly priceEur: number
  readonly costsEur: number
  /** Wert des Betriebsvermögens (capital account) at the date. */
  readonly capitalAccountEur: number
  /** The allowance is applied for and its conditions are met (age 55 or disability, never used before). */
  readonly allowance: boolean
}

export function disposalGain(input: DisposalInput): { readonly gainEur: number; readonly allowanceEur: number; readonly taxableGainEur: number } {
  const gainEur = Math.round((input.priceEur - input.costsEur - input.capitalAccountEur) * 100) / 100
  const reduced = Math.max(0, DISPOSAL_ALLOWANCE_EUR - Math.max(0, gainEur - DISPOSAL_ALLOWANCE_THRESHOLD_EUR))
  const allowanceEur = input.allowance && gainEur > 0 ? Math.min(gainEur, reduced) : 0
  return { gainEur, allowanceEur, taxableGainEur: Math.max(0, gainEur - allowanceEur) }
}

/** § 34 Abs. 3 EStG: 56 % of the average rate, at least 14 %, on up to 5 Mio. €. */
const REDUCED_SHARE = 0.56
const REDUCED_FLOOR = 0.14
const REDUCED_CAP_EUR = 5_000_000

export interface RetainedProfitInput {
  readonly year: number
  /** Gewinn nach § 4 Abs. 1 / § 5 EStG of the business. */
  readonly profitEur: number
  readonly withdrawalsEur: number
  readonly depositsEur: number
  /** The Gewerbesteuer is added back to the nicht entnommene Gewinn from VZ 2024 (Abs. 2 Satz 1 n. F.; before, it stayed off, BMF 11.08.2008 Rz. 16). */
  readonly tradeTaxEur: number
  /**
   * From VZ 2024 withdrawals to pay the § 34a tax and its Soli stay out (Abs. 2 Satz 2), and withdrawals count
   * first as paying them (Satz 3): the app takes this year's § 34a tax itself. This field adds what was withdrawn
   * this year for the § 34a tax of earlier years.
   */
  readonly withdrawalsForRetainedTaxEur?: number | undefined
  /** The business is sold or given up this year (§ 16 Abs. 1, 3, § 18 Abs. 3): the whole carried amount is recaptured (Abs. 6 Nr. 1). */
  readonly disposal?: boolean | undefined
  /** The amount applied for; at most the nicht entnommene Gewinn. */
  readonly requestedEur: number
  /** Nachversteuerungspflichtiger Betrag of the last Feststellung (Abs. 3). */
  readonly carriedForwardEur: number
}

export interface RetainedProfit {
  readonly nonWithdrawnEur: number
  /** Begünstigungsbetrag (Abs. 3 Satz 1). */
  readonly favouredEur: number
  readonly rate: number
  /** The income tax on the favoured amount. */
  readonly taxEur: number
  readonly recaptureBaseEur: number
  /** Nachsteuer at 25 % (Abs. 4). */
  readonly recaptureEur: number
  /** To be declared at year end (Abs. 3): favoured − its tax and Soli + carried − recaptured. */
  readonly nextCarriedForwardEur: number
}

/** Abs. 1 Satz 1: 28,25 % until 2027, 27 % 2028–2029, 26 % 2030–2031, 25 % from 2032. */
export function retainedProfitRate(year: number): number {
  if (year >= 2032) return 0.25
  if (year >= 2030) return 0.26
  if (year >= 2028) return 0.27
  return 0.2825
}

const RECAPTURE_RATE = 0.25
const SOLI_RATE = 0.055
const c2 = (v: number) => Math.round(v * 100) / 100

export function retainedProfitTax(input: RetainedProfitInput): RetainedProfit {
  const rate = retainedProfitRate(input.year)
  const withdrawals = Math.max(0, input.withdrawalsEur)
  const earlier = input.year >= 2024 ? Math.max(0, input.withdrawalsForRetainedTaxEur ?? 0) : 0
  const tradeTaxBack = input.year >= 2024 ? Math.max(0, input.tradeTaxEur) : 0
  const favouredFor = (excluded: number) => {
    const balance = withdrawals - excluded - input.depositsEur
    const nonWithdrawn = Math.max(0, input.profitEur - Math.max(0, balance) + tradeTaxBack)
    return { balance, nonWithdrawn, favoured: Math.min(Math.max(0, input.requestedEur), nonWithdrawn, Math.max(0, input.profitEur)) }
  }
  // Abs. 2 Satz 3 (from VZ 2024): withdrawals count first as paying this year's § 34a tax and its Soli. The tax
  // depends on the amount it frees, so the excluded part is the fixed point; each step moves by under a third.
  let excluded = Math.min(withdrawals, earlier)
  if (input.year >= 2024) {
    for (let i = 0; i < 100; i++) {
      const next = Math.min(withdrawals, earlier + favouredFor(excluded).favoured * rate * (1 + SOLI_RATE))
      if (Math.abs(next - excluded) < 0.001) {
        excluded = next
        break
      }
      excluded = next
    }
  }
  const { balance, nonWithdrawn, favoured } = favouredFor(excluded)
  const nonWithdrawnEur = c2(nonWithdrawn)
  const favouredEur = c2(favoured)
  const taxEur = c2(favouredEur * rate)
  // Abs. 4: a withdrawal surplus above the profit recaptures the carried amount, 25 %; a sale or Aufgabe of the
  // business recaptures all of it (Abs. 6 Nr. 1).
  const surplus = Math.max(0, balance - Math.max(0, input.profitEur))
  const carried = Math.max(0, input.carriedForwardEur)
  const recaptureBaseEur = c2(input.disposal ? carried : Math.min(surplus, carried))
  const recaptureEur = c2(recaptureBaseEur * RECAPTURE_RATE)
  const nextCarriedForwardEur = c2(favouredEur - taxEur - taxEur * SOLI_RATE + Math.max(0, input.carriedForwardEur) - recaptureBaseEur)
  return { nonWithdrawnEur, favouredEur, rate, taxEur, recaptureBaseEur, recaptureEur, nextCarriedForwardEur }
}

export interface SpecialTariffFacts {
  /** A § 16 gain after the allowance, inside the zvE, taxed by § 34 Abs. 1 or 3. */
  readonly extraordinary?:
    | {
        readonly gainEur: number
        readonly method: 'fuenftel' | 'ermaessigt'
        /**
         * Further § 16 gains beside the one taxed at the reduced rate: § 34 Abs. 3 Satz 5 allows it for one
         * gain only, the others take the Fünftelregelung (Abs. 1).
         */
        readonly fifthGainEur?: number | undefined
      }
    | undefined
  /** A § 34a retained profit (and recapture) of a Bilanzierer. */
  readonly retained?: Pick<RetainedProfit, 'favouredEur' | 'taxEur' | 'recaptureEur'> | undefined
}

/**
 * The tariff with the special parts taken out of it: `tariff(z)` is the ordinary tax (plain, splitting
 * or with the progression clause); the result is the tax on the whole zvE `z`.
 */
export function withSpecialTariffs(tariff: (z: number) => number, facts: SpecialTariffFacts | undefined): (z: number) => number {
  if (!facts?.extraordinary && !facts?.retained) return tariff
  return (z: number) => {
    // § 34a comes first: the favoured amount leaves the tariff (Abs. 1 Satz 1), its own tax comes on top.
    const favoured = Math.min(Math.max(0, facts.retained?.favouredEur ?? 0), Math.max(0, z))
    const rest = z - favoured
    const special = (facts.retained?.taxEur ?? 0) + (facts.retained?.recaptureEur ?? 0)
    const gain = Math.min(Math.max(0, facts.extraordinary?.gainEur ?? 0), Math.max(0, rest))
    if (gain <= 0 || !facts.extraordinary) return Math.floor(tariff(rest) + special)
    const ordinary = rest - gain
    if (facts.extraordinary.method === 'fuenftel') {
      // § 34 Abs. 1 Satz 2; with a negative rest of the income, Satz 3: five times the tax on a fifth.
      if (ordinary < 0) return Math.floor(5 * tariff(rest / 5) + special)
      return Math.floor(tariff(ordinary) + 5 * (tariff(ordinary + gain / 5) - tariff(ordinary)) + special)
    }
    const capped = Math.min(gain, REDUCED_CAP_EUR)
    const average = rest > 0 ? tariff(rest) / rest : 0
    const rate = Math.max(REDUCED_FLOOR, REDUCED_SHARE * average)
    // The rest of the income, with any further gain by the Fünftelregelung.
    const others = rest - capped
    const fifth = Math.min(Math.max(0, facts.extraordinary.fifthGainEur ?? 0), Math.max(0, others))
    const ordinaryTax = fifth <= 0 ? tariff(others) : others - fifth < 0 ? 5 * tariff(others / 5) : tariff(others - fifth) + 5 * (tariff(others - fifth + fifth / 5) - tariff(others - fifth))
    return Math.floor(ordinaryTax + capped * rate + special)
  }
}
