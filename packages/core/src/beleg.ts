import type { ReceiptType } from './belegart.js'

export type ReceiptData = {
  readonly id: string
  readonly userId: string
  readonly fileName: string
  readonly kind?: ReceiptType
  readonly belegdatum?: string
  readonly zahlungsdatum?: string
  readonly taxYear: number | null
  readonly proposalDismissed: boolean
}

export type ProposalSource = 'zahlungsdatum' | 'belegdatum'

export interface TaxYearProposal {
  readonly taxYear: number
  readonly provenance: ProposalSource
}

function yearFromDate(iso: string): number | null {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(iso)
  return match === null ? null : Number(match[1])
}

export function taxYearProposal(data: ReceiptData): TaxYearProposal | null {
  if (data.zahlungsdatum !== undefined) {
    const year = yearFromDate(data.zahlungsdatum)
    if (year !== null) return { taxYear: year, provenance: 'zahlungsdatum' }
  }
  if (data.belegdatum !== undefined) {
    const year = yearFromDate(data.belegdatum)
    if (year !== null) return { taxYear: year, provenance: 'belegdatum' }
  }
  return null
}

export type ReceiptAssignment =
  | { readonly kind: 'ungebunden' }
  | { readonly kind: 'vorgeschlagen'; readonly proposal: TaxYearProposal }
  | { readonly kind: 'zugeordnet'; readonly taxYear: number }
  | { readonly kind: 'konflikt'; readonly assigned: number; readonly proposal: TaxYearProposal }

export function assignmentFromData(data: ReceiptData): ReceiptAssignment {
  const proposal = taxYearProposal(data)
  const currentTaxYear = data.taxYear
  const isDismissed = data.proposalDismissed

  if (currentTaxYear !== null) {
    if (!isDismissed && proposal !== null && proposal.taxYear !== currentTaxYear) {
      return { kind: 'konflikt', assigned: currentTaxYear, proposal }
    }
    return { kind: 'zugeordnet', taxYear: currentTaxYear }
  }
  if (proposal !== null) return { kind: 'vorgeschlagen', proposal }
  return { kind: 'ungebunden' }
}

export function assignReceipt<T extends ReceiptData>(data: T, taxYear: number): T {
  if (!Number.isInteger(taxYear)) {
    throw new RangeError('steuerjahr must be an integer calendar year')
  }
  return {
    ...data,
    taxYear,
    proposalDismissed: false,
  }
}

export function dismissSuggestion<T extends ReceiptData>(data: T): T {
  return { ...data, proposalDismissed: true }
}
