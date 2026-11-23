import type { Range } from '../common/range'
import { employeeLumpSum, type AssessmentPositionValues } from '../domains/assessment'
import { filingTypeComparison, type FilingTypeComparison, type ProgressionClauseInput } from '../domains/filing-type-comparison'
import { isSupportedIncomeTaxYear, type ChurchTaxFactor } from '../math/tarif'

/**
 * Paare im Verlauf (ADR-0099 §6): what the Veranlagungsart brought in a Bescheid year, computed with the
 * core's comparison on the assessed zvE. Two single returns give each person's zvE exactly. A joint
 * Bescheid has one zvE; its split per person comes from the filed facts, and since the deductions cannot
 * be attributed exactly the result is approximate and carries the range of the ways to split them.
 */

interface CoupleInputBase {
  readonly year: number
  readonly progressionClause: ProgressionClauseInput
  readonly churchTaxFactor?: ChurchTaxFactor
}

export type CoupleComparisonInput =
  | (CoupleInputBase & { readonly filedAs: 'einzel'; readonly zveA: number | undefined; readonly zveB: number | undefined })
  | (CoupleInputBase & {
      readonly filedAs: 'zusammen'
      readonly zvE: number | undefined
      /** The positions per person the split is taken from: the version filed in the app, else the Bescheid's. */
      readonly split: AssessmentPositionValues | null
    })

export type CoupleComparison =
  | {
      readonly year: number
      readonly status: 'gerechnet'
      readonly filedAs: 'einzel' | 'zusammen'
      /** True for a joint Bescheid: „Rechnung der App, etwa“. */
      readonly approximate: boolean
      readonly singleTax: number
      readonly jointTax: number
      /** Two single returns minus the joint one: > 0 the joint return is (or would have been) cheaper. */
      readonly jointSaving: number
      /** The saving over the ways to split a joint Bescheid; null where it is one number. */
      readonly jointSavingRange: Range | null
      readonly statement: FilingTypeComparison['statement']
    }
  | { readonly year: number; readonly status: 'unvollstaendig'; readonly missing: readonly string[] }
  | { readonly year: number; readonly status: 'tarif-fehlt' }

const wageIncome = (p: AssessmentPositionValues, person: 'A' | 'B', lumpSum: number) =>
  Math.max(0, (p[`bruttoarbeitslohn${person}`] ?? 0) - Math.max(p[`werbungskosten${person}`] ?? 0, lumpSum))

/** zvE of A in the two ways to split: deductions in proportion to the income, and deductions halved. */
function splitVariants(zvE: number, split: AssessmentPositionValues, year: number): number[] | null {
  const lumpSum = employeeLumpSum(year) ?? 0
  const a = wageIncome(split, 'A', lumpSum)
  const b = wageIncome(split, 'B', lumpSum)
  if (a + b <= 0) return null
  const share = a / (a + b)
  const deductions = (split.vorsorgeaufwand ?? 0) + (split.sonderausgaben ?? 0) + (split.aussergewoehnlicheBelastungen ?? 0)
  const clamp = (v: number) => Math.min(zvE, Math.max(0, Math.round(v)))
  return [clamp(zvE * share), clamp((zvE + deductions) * share - deductions / 2)]
}

export function coupleComparison(input: CoupleComparisonInput): CoupleComparison {
  const { year } = input
  if (!isSupportedIncomeTaxYear(year)) return { year, status: 'tarif-fehlt' }
  const compare = (zveA: number, zveB: number) =>
    filingTypeComparison({ zveA, zveB, year, progressionClause: input.progressionClause, ...(input.churchTaxFactor !== undefined ? { churchTaxFactor: input.churchTaxFactor } : {}) })

  if (input.filedAs === 'einzel') {
    const missing = [...(input.zveA === undefined ? ['zuVersteuerndesEinkommen'] : []), ...(input.zveB === undefined ? ['personB.zuVersteuerndesEinkommen'] : [])]
    if (missing.length > 0) return { year, status: 'unvollstaendig', missing }
    const c = compare(input.zveA!, input.zveB!)
    return { year, status: 'gerechnet', filedAs: 'einzel', approximate: false, singleTax: c.single, jointTax: c.joint, jointSaving: c.single - c.joint, jointSavingRange: null, statement: c.statement }
  }

  if (input.zvE === undefined) return { year, status: 'unvollstaendig', missing: ['zuVersteuerndesEinkommen'] }
  const zvE = input.zvE
  const variants = input.split === null ? null : splitVariants(zvE, input.split, year)
  if (variants === null) return { year, status: 'unvollstaendig', missing: ['aufteilung'] }
  const results = variants.map((zveA) => compare(zveA, zvE - zveA))
  const central = results[0]!
  const savings = results.map((c) => c.single - c.joint)
  const from = Math.min(...savings)
  const to = Math.max(...savings)
  return {
    year,
    status: 'gerechnet',
    filedAs: 'zusammen',
    approximate: true,
    singleTax: central.single,
    jointTax: central.joint,
    jointSaving: central.single - central.joint,
    jointSavingRange: from === to ? null : { from, to },
    statement: central.statement,
  }
}
