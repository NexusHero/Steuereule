import type { HolderRef, ReceiptType } from '@steuereule/core'

export interface ReceiptFileMetaRecord {
  readonly mimeType: string
  readonly byteLength: number
}

export interface ReceiptRecord {
  id: string
  userId: string
  fileName: string
  kind?: ReceiptType | ReceiptType
  receiptType?: ReceiptType | ReceiptType
  belegdatum?: string
  receiptDate?: string
  zahlungsdatum?: string
  paymentDate?: string
  taxYear: number | null
  proposalDismissed: boolean
  /** Whose document it is (ADR-0092), the holder first; empty while nobody is chosen. */
  holders?: readonly HolderRef[]
  /** The tax year the holders refer to. */
  holderTaxYear?: number | null
  fileMeta?: ReceiptFileMetaRecord | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateReceiptData {
  fileName: string
  kind?: ReceiptType | ReceiptType
  receiptType?: ReceiptType | ReceiptType
  belegdatum?: string
  receiptDate?: string
  zahlungsdatum?: string
  paymentDate?: string
}

/** The one assignment write: confirm a year, optionally dismissing a contradicting suggestion. */
export interface SetAssignmentData {
  taxYear: number
  proposalDismissed: boolean
}

export const RECEIPT_REPOSITORY = Symbol('RECEIPT_REPOSITORY')

/** The persistence seam for Beleg / Receipt. */
export interface ReceiptRepository {
  findAllForUser(userId: string): Promise<ReceiptRecord[]>
  findByIdForUser(userId: string, id: string): Promise<ReceiptRecord | null>
  create(userId: string, data: CreateReceiptData): Promise<ReceiptRecord>
  setAssignment(userId: string, id: string, data: SetAssignmentData): Promise<ReceiptRecord | null>
  /** Records whose document it is (ADR-0092): the holder first, then the people it was also taken over for. */
  setHolders(userId: string, id: string, holders: readonly HolderRef[], taxYear: number): Promise<ReceiptRecord | null>
  deleteForUser(userId: string, id: string): Promise<boolean>
}
