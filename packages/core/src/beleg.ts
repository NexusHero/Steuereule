import type { ReceiptType } from './belegart.js'

export type ReceiptData = {
  readonly id: string
  readonly userId: string
  readonly dateiname: string
  readonly art?: ReceiptType
  readonly belegdatum?: string
  readonly zahlungsdatum?: string
  readonly steuerjahr: number | null
  readonly vorschlagVerworfen: boolean
}

export type ProposalSource = 'zahlungsdatum' | 'belegdatum'

export interface TaxYearProposal {
  readonly steuerjahr: number
  readonly provenance: ProposalSource
}

function yearFromDate(iso: string): number | null {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(iso)
  return match === null ? null : Number(match[1])
}

export function taxYearProposal(data: ReceiptData): TaxYearProposal | null {
  if (data.zahlungsdatum !== undefined) {
    const year = yearFromDate(data.zahlungsdatum)
    if (year !== null) return { steuerjahr: year, provenance: 'zahlungsdatum' }
  }
  if (data.belegdatum !== undefined) {
    const year = yearFromDate(data.belegdatum)
    if (year !== null) return { steuerjahr: year, provenance: 'belegdatum' }
  }
  return null
}

export type ReceiptAssignment =
  | { readonly kind: 'ungebunden' }
  | { readonly kind: 'vorgeschlagen'; readonly proposal: TaxYearProposal }
  | { readonly kind: 'zugeordnet'; readonly steuerjahr: number }
  | { readonly kind: 'konflikt'; readonly assigned: number; readonly proposal: TaxYearProposal }

export function assignmentFromData(data: ReceiptData): ReceiptAssignment {
  const proposal = taxYearProposal(data)
  const currentTaxYear = data.steuerjahr
  const isDismissed = data.vorschlagVerworfen

  if (currentTaxYear !== null) {
    if (!isDismissed && proposal !== null && proposal.steuerjahr !== currentTaxYear) {
      return { kind: 'konflikt', assigned: currentTaxYear, proposal }
    }
    return { kind: 'zugeordnet', steuerjahr: currentTaxYear }
  }
  if (proposal !== null) return { kind: 'vorgeschlagen', proposal }
  return { kind: 'ungebunden' }
}

export function assignReceipt<T extends ReceiptData>(data: T, steuerjahr: number): T {
  if (!Number.isInteger(steuerjahr)) {
    throw new RangeError('steuerjahr must be an integer calendar year')
  }
  return {
    ...data,
    steuerjahr,
    vorschlagVerworfen: false,
  }
}

export function dismissSuggestion<T extends ReceiptData>(data: T): T {
  return { ...data, vorschlagVerworfen: true }
}
