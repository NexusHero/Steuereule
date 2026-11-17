import { getTaxYearParameters } from '../math/tax-parameters'

/**
 * What one person paid for provision in the year, line by line as the Anlage Vorsorgeaufwand, the
 * Lohnsteuerbescheinigung (Zeilen 22–27) and the Anlage N-Gre (Zeilen 82, 85, 88) carry it. Amounts
 * are euros and may carry cents; the deduction rounds as the tax office does.
 */
export interface PersonProvision {
  /** Employee contributions to the basic pension: gesetzliche RV (LStB 23), AHV/IV and the BVG-Obligatorium (N-Gre 85). */
  readonly pensionOwnEur: number
  /** The employer's tax-free share of the same (LStB 22, N-Gre 88). */
  readonly pensionEmployerEur: number
  /**
   * Basic health insurance as it stands on the certificate: for a voluntarily insured employee LStB 25
   * holds the whole contribution and Zeile 24 the employer's subsidy.
   */
  readonly healthBasicEur: number
  /** The part of `healthBasicEur` that carries a claim to Krankengeld (statutory insurance of an employee). */
  readonly healthWithSickPayEur: number
  readonly careEur: number
  /** Tax-free employer subsidies to health and care insurance (LStB 24 a–c). */
  readonly employerSubsidyEur: number
  /** The care part of `employerSubsidyEur` (LStB 24c); absent = split like the contributions. */
  readonly employerCareSubsidyEur?: number | undefined
  /** Everything else of § 10 Abs. 1 Nr. 3a EStG: unemployment insurance, EO, ALV, Krankentaggeld, supplementary insurance. */
  readonly otherEur: number
  /**
   * § 10 Abs. 4 Satz 2 EStG: someone else carries part of the health costs (employer subsidy, Beihilfe,
   * family insurance) — the cap for other provision is 1.900 € instead of 2.800 €.
   */
  readonly reducedOtherCap: boolean
}

/** Insurance the parents pay for their children (Anlage Kind Zeilen 27–38). */
export interface ChildrenProvision {
  readonly healthBasicEur: number
  readonly careEur: number
  /** Beyond the basic cover (Wahlleistungen, Zusatzversicherung). */
  readonly otherEur: number
}

/** The lines of the notice under „beschränkt abziehbare Sonderausgaben“. */
export interface ProvisionDeduction {
  /** Summe der Altersvorsorgeaufwendungen (own and employer share). */
  readonly pensionTotalEur: number
  readonly pensionEmployerEur: number
  /** verbleiben: what is deducted for the basic pension. */
  readonly pensionEur: number
  readonly healthEur: number
  /** Kürzungsbetrag nach § 10 Abs. 1 Nr. 3 Buchst. a Satz 4 EStG. */
  readonly sickPayCutEur: number
  readonly careEur: number
  readonly employerSubsidyEur: number
  /** Basic health and care insurance after the cut and the subsidies. */
  readonly basicEur: number
  readonly otherEur: number
  /** The joint cap of § 10 Abs. 4 EStG. */
  readonly otherCapEur: number
  /** What is deducted for health, care and other provision together. */
  readonly healthCareOtherEur: number
  readonly totalEur: number
}

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)
/** Sums in cents, so 1.539,86 € twice is 3.079,72 € and not a float beside it. */
const sumCents = (values: readonly number[]) => sum(values.map((value) => Math.round(value * 100))) / 100

/**
 * The deduction for provision as the tax office computes it (§ 10 Abs. 1 Nr. 2, 3, 3a, Abs. 3 and 4 EStG),
 * checked against two real notices (2024 and 2025, ADR-0094):
 *
 * - Basic pension: own and employer contributions together, at most the Höchstbetrag (doubled for a
 *   couple), times the share of the year, less the employer's tax-free share.
 * - Basic health and care insurance: fully, the health part with a Krankengeld claim less 4 % (taken on
 *   the contribution after its own subsidy), less the tax-free employer subsidies.
 * - Other provision only as far as basic insurance leaves room under the cap of 1.900 € or 2.800 € a
 *   person; the caps of a couple add up.
 */
export function deductibleProvision(year: number, persons: readonly PersonProvision[], children?: ChildrenProvision): ProvisionDeduction {
  const params = getTaxYearParameters(year).provision
  const pensionEmployerEur = Math.round(sumCents(persons.map((p) => p.pensionEmployerEur)))
  const pensionTotalEur = Math.round(sumCents(persons.flatMap((p) => [p.pensionOwnEur, p.pensionEmployerEur])))
  const pensionCap = params.maxPensionProvisionEur * persons.length
  const pensionEur = Math.max(0, Math.ceil(Math.min(pensionTotalEur, pensionCap) * params.pensionDeductibleShare) - pensionEmployerEur)

  const healthEur = Math.round(sumCents(persons.map((p) => p.healthBasicEur)) + (children?.healthBasicEur ?? 0))
  const careEur = Math.round(sumCents(persons.map((p) => p.careEur)) + (children?.careEur ?? 0))
  const sickPayCutEur = sum(persons.map((p) => Math.floor(Math.max(0, p.healthWithSickPayEur - healthSubsidy(p)) * params.sickPayReductionRate)))
  const employerSubsidyEur = Math.round(sumCents(persons.map((p) => p.employerSubsidyEur)))
  const basicEur = Math.max(0, healthEur - sickPayCutEur + careEur - employerSubsidyEur)

  const otherEur = Math.round(sumCents(persons.map((p) => p.otherEur)) + (children?.otherEur ?? 0))
  const otherCapEur = sum(persons.map((p) => (p.reducedOtherCap ? params.maxOtherProvisionEmployeeEur : params.maxOtherProvisionSingleEur)))
  const healthCareOtherEur = Math.max(basicEur, Math.min(basicEur + otherEur, otherCapEur))
  return {
    pensionTotalEur,
    pensionEmployerEur,
    pensionEur,
    healthEur,
    sickPayCutEur,
    careEur,
    employerSubsidyEur,
    basicEur,
    otherEur,
    otherCapEur,
    healthCareOtherEur,
    totalEur: pensionEur + healthCareOtherEur,
  }
}

/** The employer subsidy that belongs to the health contribution with a Krankengeld claim. */
function healthSubsidy(p: PersonProvision): number {
  if (p.employerSubsidyEur <= 0) return 0
  if (p.employerCareSubsidyEur !== undefined) return Math.max(0, p.employerSubsidyEur - p.employerCareSubsidyEur)
  const base = p.healthWithSickPayEur + p.careEur
  return base > 0 ? (p.employerSubsidyEur * p.healthWithSickPayEur) / base : 0
}
