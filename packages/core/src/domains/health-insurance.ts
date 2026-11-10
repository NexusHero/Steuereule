import { amountFromAnswer, type Answers } from '../interview/interview'
import { isSupportedIncomeTaxYear } from '../math/tarif'
import { getTaxYearParameters } from '../math/tax-parameters'

export type HealthInsuranceKind = 'gesetzlich' | 'privat' | 'ausland'

/** Self-paid health and care insurance of one person, as the Anlage Vorsorgeaufwand asks for it. */
export interface HealthInsurance {
  readonly kind: HealthInsuranceKind
  /** KV Basisabsicherung, without care insurance and extras. */
  readonly basicHealthAmount: number
  /** Whether the KV contributions carry a Krankengeld claim (only asked for statutory and foreign insurance). */
  readonly withSickPay: boolean
  readonly careInsuranceAmount: number
  /** Beyond the Basisabsicherung (Wahlleistungen, Zusatzversicherungen). */
  readonly optionalExtrasAmount: number
}

const KIND_MAP: Readonly<Record<string, HealthInsuranceKind>> = {
  'Gesetzlich (freiwillig)': 'gesetzlich',
  Privat: 'privat',
  Ausländisch: 'ausland',
}

export function healthInsuranceFromAnswers(answers: Answers): HealthInsurance | null {
  if (answers['kv-pv'] !== 'Ja') return null
  return {
    kind: KIND_MAP[answers['kv-pv-art'] ?? ''] ?? 'gesetzlich',
    basicHealthAmount: amountFromAnswer(answers['kv-pv-betrag']) ?? 0,
    withSickPay: answers['kv-krankengeld'] === 'Ja',
    careInsuranceAmount: amountFromAnswer(answers['pv-betrag']) ?? 0,
    optionalExtrasAmount: amountFromAnswer(answers['kv-wahl-betrag']) ?? 0,
  }
}

/** § 10 Abs. 1 Nr. 3 EStG: KV with a Krankengeld claim counts 4 % less; PV fully; extras only within § 10 Abs. 4 — not counted here. */
export function deductibleBasicProvision(kv: HealthInsurance | null, taxYear?: number): number {
  if (kv === null) return 0
  const reduction =
    taxYear !== undefined && isSupportedIncomeTaxYear(taxYear)
      ? getTaxYearParameters(taxYear).provision.sickPayReductionRate
      : 0.04
  const factor = 1 - reduction
  const basic = kv.withSickPay ? kv.basicHealthAmount * factor : kv.basicHealthAmount
  return Math.round(basic) + kv.careInsuranceAmount
}
