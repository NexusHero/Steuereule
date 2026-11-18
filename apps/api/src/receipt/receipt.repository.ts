import type { HolderRef, ReceiptReadOutcome, ReceiptReadReason, ReceiptType } from '@steuereule/core'

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
  /** The facts of the last read (ADR-0097); absent or null while the Beleg was never read. */
  readAt?: Date | null
  readOutcome?: ReceiptReadOutcome | null
  readReason?: ReceiptReadReason | null
  draftsTaxYear?: number | null
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

/** What one read of a Beleg found out (ADR-0097 §2), written after every parse. */
export interface RecordReadData {
  readonly outcome: ReceiptReadOutcome
  readonly reason: ReceiptReadReason | null
  /** The tax year the drafts went to; null when none were staged. */
  readonly draftsTaxYear: number | null
  /** The document's date the reader recognised (ISO yyyy-mm-dd), stored as `belegdatum` for ADR-0040's year rule. */
  readonly belegdatum?: string | undefined
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
  /** Records the recognised document kind of a stored Beleg (the parse found out what it is). */
  setKind(userId: string, id: string, kind: ReceiptType): Promise<ReceiptRecord | null>
  /** Records the outcome of a read and, when the reader recognised one, the document's date. */
  recordRead(userId: string, id: string, data: RecordReadData): Promise<ReceiptRecord | null>
  deleteForUser(userId: string, id: string): Promise<boolean>
}
