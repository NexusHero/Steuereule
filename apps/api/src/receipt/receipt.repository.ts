import type { HolderRef, ReceiptDirection, ReceiptFolder, ReceiptReadOutcome, ReceiptReadReason, ReceiptType } from '@steuereule/core'

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
  /** A business receipt (ADR-0101 §6): expense or income; absent for every other Beleg. */
  direction?: ReceiptDirection | null
  createdAt: Date
  updatedAt: Date
}

/**
 * The stored facts every derived state of a Beleg is computed from: no file name (encrypted), no holders,
 * no file. Enough for the inbox counts without decrypting or joining anything.
 */
export type ReceiptFacts = Pick<
  ReceiptRecord,
  'id' | 'kind' | 'taxYear' | 'belegdatum' | 'zahlungsdatum' | 'proposalDismissed' | 'readAt' | 'readOutcome' | 'readReason' | 'draftsTaxYear' | 'createdAt'
>

/** One page of the inbox, newest first: keyset on (createdAt, id), so a page costs the same however far in. */
export interface ReceiptPageQuery {
  readonly limit: number
  readonly after?: { readonly createdAt: Date; readonly id: string }
  readonly folder?: ReceiptFolder
}

export interface CreateReceiptData {
  fileName: string
  kind?: ReceiptType | ReceiptType
  receiptType?: ReceiptType | ReceiptType
  belegdatum?: string
  receiptDate?: string
  zahlungsdatum?: string
  paymentDate?: string
  direction?: ReceiptDirection
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
  /**
   * The year the reader filed the drafts in, kept as the Beleg's year while the user has not chosen one
   * (ADR-0097 §5). The reader decides the year by § 11 for its document kind; the date printed on a
   * Beleg is often the issue date (a donation confirmation of January 2026 for 2025), so it is not used.
   */
  readonly taxYear?: number | undefined
}

export const RECEIPT_REPOSITORY = Symbol('RECEIPT_REPOSITORY')

/** The persistence seam for Beleg / Receipt. */
export interface ReceiptRepository {
  findAllForUser(userId: string): Promise<ReceiptRecord[]>
  findByIdForUser(userId: string, id: string): Promise<ReceiptRecord | null>
  /** The facts of every Beleg of the user, newest first: the base of the inbox counts. */
  listFactsForUser(userId: string): Promise<ReceiptFacts[]>
  /** At most `query.limit` Belege, newest first, behind `query.after` and inside `query.folder`. */
  findPageForUser(userId: string, query: ReceiptPageQuery): Promise<ReceiptRecord[]>
  findManyByIdsForUser(userId: string, ids: readonly string[]): Promise<ReceiptRecord[]>
  /**
   * Creates a Beleg unless the account already holds `maxRows` of them, then `null` (ADR-0108). Counting and
   * creating are one step per account: two requests at the cap cannot both pass a count taken beforehand.
   */
  create(userId: string, data: CreateReceiptData, maxRows: number): Promise<ReceiptRecord | null>
  setAssignment(userId: string, id: string, data: SetAssignmentData): Promise<ReceiptRecord | null>
  /** Records whose document it is (ADR-0092): the holder first, then the people it was also taken over for. */
  setHolders(userId: string, id: string, holders: readonly HolderRef[], taxYear: number): Promise<ReceiptRecord | null>
  /** Records the recognised document kind of a stored Beleg (the parse found out what it is). */
  setKind(userId: string, id: string, kind: ReceiptType): Promise<ReceiptRecord | null>
  /** Records the outcome of a read and, when the reader recognised one, the document's date. */
  recordRead(userId: string, id: string, data: RecordReadData): Promise<ReceiptRecord | null>
  deleteForUser(userId: string, id: string): Promise<boolean>
}
