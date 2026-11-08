import type { WageTaxCertificateFieldId, WageTaxCertificateStatus } from '../domains/lstb.js'
import type { WorkdaysResult } from '../common/workdays.js'
import type { EmployeeStatus } from '../domains/employee.js'
import type { IncomeType } from '../domains/income-types.js'

export type Conflict =
  | { readonly kind: 'lstb-offen'; readonly fields: readonly WageTaxCertificateFieldId[] }
  | { readonly kind: 'lstb-unklar'; readonly fields: readonly WageTaxCertificateFieldId[] }
  | { readonly kind: 'lstb-widerspruch' }
  | { readonly kind: 'werktage-widerspruch' }
  | { readonly kind: 'gated-einkunftsart'; readonly incomeType: IncomeType }

export type Notice =
  | { readonly kind: 'erfasst-nicht-gerechnet'; readonly amount: number }
  | { readonly kind: 'werbungskosten-uebersteigt-einnahmen'; readonly werbungskosten: number; readonly einnahmen: number }

export interface PlausibilityInput {
  readonly lstb: WageTaxCertificateStatus
  readonly workdays: WorkdaysResult
  readonly status: EmployeeStatus
  readonly recordedNotCalculated: number
}

export type PlausibilityResult =
  | { readonly kind: 'einreichbar'; readonly notices: readonly Notice[] }
  | { readonly kind: 'nicht-einreichbar'; readonly conflicts: readonly Conflict[]; readonly notices: readonly Notice[] }

export function checkPlausibility(inputs: PlausibilityInput): PlausibilityResult {
  const conflicts: Conflict[] = []
  const notices: Notice[] = []

  if (inputs.lstb.kind === 'unvollstaendig') {
    if (inputs.lstb.open.length > 0) conflicts.push({ kind: 'lstb-offen', fields: inputs.lstb.open })
    if (inputs.lstb.unclear.length > 0) conflicts.push({ kind: 'lstb-unklar', fields: inputs.lstb.unclear })
  } else if (inputs.lstb.kind === 'widerspruch') {
    conflicts.push({ kind: 'lstb-widerspruch' })
  }

  if (inputs.workdays.kind === 'widerspruch') {
    conflicts.push({ kind: 'werktage-widerspruch' })
  }

  if (inputs.status.kind === 'offen') {
    for (const incomeType of inputs.status.gated) {
      conflicts.push({ kind: 'gated-einkunftsart', incomeType })
    }
  }

  if (inputs.recordedNotCalculated > 0) {
    notices.push({ kind: 'erfasst-nicht-gerechnet', amount: inputs.recordedNotCalculated })
  }
  const { einnahmen, werbungskosten } = inputs.status
  if (werbungskosten > einnahmen) {
    notices.push({ kind: 'werbungskosten-uebersteigt-einnahmen', werbungskosten, einnahmen })
  }

  if (conflicts.length === 0) return { kind: 'einreichbar', notices }
  return { kind: 'nicht-einreichbar', conflicts, notices }
}
