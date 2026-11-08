import {
  crossBorderStatus,
  openSalaryCertificateFields,
  CROSS_BORDER_NON_RETURN_DAYS,
  type ChWohnsitz,
  type SalaryCertificateFieldId,
  type SalaryCertificateValues,
} from './cross-border'
import type { ExchangeRate } from './exchange-rate'

export type PlausibilityLevel = 'widerspruch' | 'hinweis' | 'offen'

export interface PlausibilityPoint {
  readonly grad: PlausibilityLevel
  readonly code: string
  readonly field?: SalaryCertificateFieldId
}

export interface PlausibilityFinding {
  readonly submittable: boolean
  readonly points: readonly PlausibilityPoint[]
}

export interface CrossBorderPlausibilityInput {
  readonly residence: ChWohnsitz
  readonly nonReturnDays: number
  readonly exchangeRate: ExchangeRate
  readonly salaryCertificate: SalaryCertificateValues
  readonly hasChildren: boolean
  readonly hasFamilyAllowances: boolean
}

export function checkCrossBorder(input: CrossBorderPlausibilityInput): PlausibilityFinding {
  const status = crossBorderStatus(input.residence, input.nonReturnDays)
  const points: PlausibilityPoint[] = []

  if (input.exchangeRate.mode === 'tatsaechlich' && input.exchangeRate.receiptId === undefined) {
    points.push({ grad: 'widerspruch', code: 'wechselkurs-tatsaechlich-ohne-beleg' })
  }

  for (const field of openSalaryCertificateFields(input.salaryCertificate, status)) {
    points.push({ grad: 'offen', code: 'lohnausweis-fehlt', field })
  }

  const grossWage = input.salaryCertificate['bruttolohn-total']
  const nettolohn = input.salaryCertificate.nettolohn
  const ahv = input.salaryCertificate['ahv-beitraege']
  const pk = input.salaryCertificate['berufliche-vorsorge']
  if (grossWage !== undefined && nettolohn !== undefined && ahv !== undefined && pk !== undefined) {
    if (nettolohn !== grossWage - ahv - pk) {
      points.push({ grad: 'widerspruch', code: 'lohnausweis-nettolohn-inkonsistent' })
    }
  }

  if (input.hasFamilyAllowances && !input.hasChildren) {
    points.push({ grad: 'widerspruch', code: 'zulagen-ohne-kinder' })
  }

  if (input.residence === 'Deutschland' && input.nonReturnDays > CROSS_BORDER_NON_RETURN_DAYS) {
    points.push({ grad: 'hinweis', code: 'grenzgaenger-status-verloren' })
  }

  const submittable = points.every((p) => p.grad === 'hinweis')
  return { submittable, points }
}
