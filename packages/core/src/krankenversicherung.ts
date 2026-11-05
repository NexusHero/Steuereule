import type { Answers } from './interview'

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

export interface Krankenversicherung {
  readonly art: HealthInsuranceKind
  readonly kvBasis: number
  readonly mitKrankengeld: boolean
  readonly pv: number
  readonly wahlleistungen: number
}

const ART_MAP: Readonly<Record<string, HealthInsuranceKind>> = {
  'Gesetzlich (freiwillig)': 'gesetzlich',
  Privat: 'privat',
  Ausländisch: 'ausland',
}

function parseAmount(value: string | undefined): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

export function krankenversicherungAusAntworten(answers: Answers): Krankenversicherung | null {
  if (answers['kv-pv'] !== 'Ja') return null
  return {
    art: ART_MAP[answers['kv-pv-art'] ?? ''] ?? 'gesetzlich',
    kvBasis: parseAmount(answers['kv-pv-betrag']),
    mitKrankengeld: answers['kv-krankengeld'] === 'Ja',
    pv: parseAmount(answers['pv-betrag']),
    wahlleistungen: parseAmount(answers['kv-wahl-betrag']),
  }
}

export function healthInsuranceFromAnswers(answers: Answers): HealthInsurance | null {
  const kv = krankenversicherungAusAntworten(answers)
  if (kv === null) return null
  return {
    kind: kv.art,
    basicHealthAmount: kv.kvBasis,
    withSickPay: kv.mitKrankengeld,
    careInsuranceAmount: kv.pv,
    optionalExtrasAmount: kv.wahlleistungen,
  }
}

/** § 10 Abs. 1 Nr. 3 EStG: KV with a Krankengeld claim counts 4 % less; PV fully; extras only within § 10 Abs. 4 — not counted here. */
export function deductibleBasicProvision(kv: Krankenversicherung | HealthInsurance | null): number {
  if (kv === null) return 0
  const hasSickPay = 'withSickPay' in kv ? kv.withSickPay : kv.mitKrankengeld
  const basicAmount = 'basicHealthAmount' in kv ? kv.basicHealthAmount : kv.kvBasis
  const careAmount = 'careInsuranceAmount' in kv ? kv.careInsuranceAmount : kv.pv
  return Math.round(hasSickPay ? basicAmount * 0.96 : basicAmount) + careAmount
}
