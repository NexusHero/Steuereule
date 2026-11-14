/**
 * Gift and inheritance tax (ErbStG) for one acquisition: tax class (§ 15), personal allowance
 * (§ 16), the allowance for maintenance on death (§ 17), the rate (§ 19 Abs. 1) with the hardship
 * relief at the bracket limits (§ 19 Abs. 3), and the ten-year rule (§ 14). Exemptions for
 * particular assets (family home, business property, household goods) are not applied here; the
 * owl names them. The figures are those of the skill reference erbschaft-schenkung.md (checked against the law 12.11.2026).
 */

export const GIFT_TAX_RELATIONS = [
  'spouse',
  'child',
  'stepchild',
  'grandchild',
  'grandchild_parent_deceased',
  'great_grandchild',
  'parent',
  'grandparent',
  'sibling',
  'niece_nephew',
  'stepparent',
  'child_in_law',
  'parent_in_law',
  'divorced_spouse',
  'other',
] as const
export type GiftTaxRelation = (typeof GIFT_TAX_RELATIONS)[number]
export type GiftTaxClass = 'I' | 'II' | 'III'

/** § 15 Abs. 1 ErbStG. Parents and grandparents are class I only for an acquisition on death. */
export function giftTaxClass(relation: GiftTaxRelation, onDeath: boolean): GiftTaxClass {
  switch (relation) {
    case 'spouse':
    case 'child':
    case 'stepchild':
    case 'grandchild':
    case 'grandchild_parent_deceased':
    case 'great_grandchild':
      return 'I'
    case 'parent':
    case 'grandparent':
      return onDeath ? 'I' : 'II'
    case 'sibling':
    case 'niece_nephew':
    case 'stepparent':
    case 'child_in_law':
    case 'parent_in_law':
    case 'divorced_spouse':
      return 'II'
    case 'other':
      return 'III'
  }
}

/** § 16 Abs. 1 ErbStG, for persons with unlimited tax liability. */
export function personalAllowance(relation: GiftTaxRelation, onDeath: boolean): number {
  switch (relation) {
    case 'spouse':
      return 500_000
    case 'child':
    case 'stepchild':
    case 'grandchild_parent_deceased':
      return 400_000
    case 'grandchild':
      return 200_000
    case 'great_grandchild':
      return 100_000
    case 'parent':
    case 'grandparent':
      return onDeath ? 100_000 : 20_000
    default:
      return 20_000
  }
}

/**
 * § 17 ErbStG, on death only: spouse 256.000 €, children by age. It is reduced by the capital value
 * of pensions the heir receives because of the death; that is left to the owl to ask.
 */
export function maintenanceAllowance(relation: GiftTaxRelation, onDeath: boolean, childAge?: number): number {
  if (!onDeath) return 0
  if (relation === 'spouse') return 256_000
  if ((relation === 'child' || relation === 'stepchild') && childAge !== undefined) {
    if (childAge <= 5) return 52_000
    if (childAge <= 10) return 41_000
    if (childAge <= 15) return 30_700
    if (childAge <= 20) return 20_500
    if (childAge < 27) return 10_300
  }
  return 0
}

/** § 19 Abs. 1 ErbStG: the brackets up to which each rate applies. */
const BRACKETS = [75_000, 300_000, 600_000, 6_000_000, 13_000_000, 26_000_000, Number.POSITIVE_INFINITY]
const RATES: Readonly<Record<GiftTaxClass, readonly number[]>> = {
  I: [7, 11, 15, 19, 23, 27, 30],
  II: [15, 20, 25, 30, 35, 40, 43],
  III: [30, 30, 30, 30, 50, 50, 50],
}

/**
 * The tax on a taxable acquisition (already rounded down to full 100 €, § 10 Abs. 1 Satz 6). Above
 * a bracket limit the extra tax against the limit is capped at half (rate up to 30 %) or three
 * quarters (rate above 30 %) of the amount over the limit (§ 19 Abs. 3).
 */
export function giftTaxOn(taxable: number, taxClass: GiftTaxClass): { readonly taxEur: number; readonly ratePercent: number } {
  if (taxable <= 0) return { taxEur: 0, ratePercent: 0 }
  const index = BRACKETS.findIndex((limit) => taxable <= limit)
  const rate = RATES[taxClass][index]!
  const full = (taxable * rate) / 100
  if (index === 0) return { taxEur: Math.floor(full), ratePercent: rate }
  const limit = BRACKETS[index - 1]!
  const atLimit = (limit * RATES[taxClass][index - 1]!) / 100
  const relief = atLimit + (taxable - limit) * (rate <= 30 ? 0.5 : 0.75)
  return { taxEur: Math.floor(Math.min(full, relief)), ratePercent: rate }
}

export interface GiftTaxInput {
  readonly relation: GiftTaxRelation
  readonly onDeath: boolean
  /** Value of what is acquired now, after debts and the exemptions the owl has already taken off. */
  readonly valueEur: number
  /** Earlier gifts from the same person within the last ten years (§ 14). */
  readonly priorGiftsEur?: number | undefined
  /** On death, for the maintenance allowance of a child. */
  readonly childAge?: number | undefined
}

export interface GiftTaxResult {
  readonly taxClass: GiftTaxClass
  readonly personalAllowanceEur: number
  readonly maintenanceAllowanceEur: number
  readonly taxableEur: number
  readonly ratePercent: number
  /** Tax on everything within the ten years, before the earlier tax is taken off. */
  readonly totalTaxEur: number
  /** The tax the earlier gifts would cost under today's rules (§ 14 Abs. 1 Satz 2). */
  readonly priorTaxEur: number
  readonly taxEur: number
}

const roundDownTo100 = (value: number): number => Math.max(0, Math.floor(value / 100) * 100)

export function computeGiftTax(input: GiftTaxInput): GiftTaxResult {
  if (!(input.valueEur >= 0) || !((input.priorGiftsEur ?? 0) >= 0)) throw new RangeError('values must not be negative')
  const taxClass = giftTaxClass(input.relation, input.onDeath)
  const personalAllowanceEur = personalAllowance(input.relation, input.onDeath)
  const maintenanceAllowanceEur = maintenanceAllowance(input.relation, input.onDeath, input.childAge)
  const prior = input.priorGiftsEur ?? 0
  const taxableEur = roundDownTo100(input.valueEur + prior - personalAllowanceEur - maintenanceAllowanceEur)
  const total = giftTaxOn(taxableEur, taxClass)
  // The earlier gifts are taxed as if on their own under today's allowance, and that tax is deducted.
  const priorTaxEur = prior > 0 ? giftTaxOn(roundDownTo100(prior - personalAllowanceEur), taxClass).taxEur : 0
  return {
    taxClass,
    personalAllowanceEur,
    maintenanceAllowanceEur,
    taxableEur,
    ratePercent: total.ratePercent,
    totalTaxEur: total.taxEur,
    priorTaxEur,
    taxEur: Math.max(0, total.taxEur - priorTaxEur),
  }
}
