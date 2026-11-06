import type { WageTaxCertificateFieldId, WageTaxCertificateStatus } from './lstb.js'
import type { WorkdaysResult } from './werktage.js'
import type { EmployeeStatus } from './angestellte.js'
import type { IncomeType } from './einkunftsarten.js'

export type Conflict =
  | { readonly art: 'lstb-offen'; readonly fields: readonly WageTaxCertificateFieldId[] }
  | { readonly art: 'lstb-unklar'; readonly fields: readonly WageTaxCertificateFieldId[] }
  | { readonly art: 'lstb-widerspruch' }
  | { readonly art: 'werktage-widerspruch' }
  | { readonly art: 'gated-einkunftsart'; readonly incomeType: IncomeType }

export type Notice =
  | { readonly art: 'erfasst-nicht-gerechnet'; readonly amount: number }
  | { readonly art: 'werbungskosten-uebersteigt-einnahmen'; readonly werbungskosten: number; readonly einnahmen: number }

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
    if (inputs.lstb.open.length > 0) conflicts.push({ art: 'lstb-offen', fields: inputs.lstb.open })
    if (inputs.lstb.unclear.length > 0) conflicts.push({ art: 'lstb-unklar', fields: inputs.lstb.unclear })
  } else if (inputs.lstb.kind === 'widerspruch') {
    conflicts.push({ art: 'lstb-widerspruch' })
  }

  if (inputs.workdays.kind === 'widerspruch') {
    conflicts.push({ art: 'werktage-widerspruch' })
  }

  if (inputs.status.kind === 'offen') {
    for (const incomeType of inputs.status.gated) {
      conflicts.push({ art: 'gated-einkunftsart', incomeType })
    }
  }

  if (inputs.recordedNotCalculated > 0) {
    notices.push({ art: 'erfasst-nicht-gerechnet', amount: inputs.recordedNotCalculated })
  }
  const { einnahmen, werbungskosten } = inputs.status
  if (werbungskosten > einnahmen) {
    notices.push({ art: 'werbungskosten-uebersteigt-einnahmen', werbungskosten, einnahmen })
  }

  if (conflicts.length === 0) return { kind: 'einreichbar', notices }
  return { kind: 'nicht-einreichbar', conflicts, notices }
}
