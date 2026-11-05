import type { ReceiptType } from '@steuereule/core'

export interface ReceiptRecord {
  id: string
  userId: string
  dateiname: string
  filename?: string
  art?: ReceiptType | ReceiptType
  receiptType?: ReceiptType | ReceiptType
  belegdatum?: string
  receiptDate?: string
  zahlungsdatum?: string
  paymentDate?: string
  steuerjahr: number | null
  taxYear?: number | null
  vorschlagVerworfen: boolean
  suggestionDismissed?: boolean
  createdAt: Date
  updatedAt: Date
}

export interface CreateReceiptData {
  dateiname: string
  filename?: string
  art?: ReceiptType | ReceiptType
  receiptType?: ReceiptType | ReceiptType
  belegdatum?: string
  receiptDate?: string
  zahlungsdatum?: string
  paymentDate?: string
}

/** The one assignment write: confirm a year, optionally dismissing a contradicting suggestion. */
export interface SetAssignmentData {
  steuerjahr: number
  taxYear?: number
  vorschlagVerworfen: boolean
  suggestionDismissed?: boolean
}

export const RECEIPT_REPOSITORY = Symbol('RECEIPT_REPOSITORY')

/** The persistence seam for Beleg / Receipt. */
export interface ReceiptRepository {
  findAllForUser(userId: string): Promise<ReceiptRecord[]>
  findByIdForUser(userId: string, id: string): Promise<ReceiptRecord | null>
  create(userId: string, data: CreateReceiptData): Promise<ReceiptRecord>
  setZuordnung(userId: string, id: string, data: SetAssignmentData): Promise<ReceiptRecord | null>
}
