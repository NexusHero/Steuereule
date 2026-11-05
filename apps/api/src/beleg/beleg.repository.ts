import type { Belegart, ReceiptType } from '@steuereule/core'

export interface ReceiptRecord {
  id: string
  userId: string
  dateiname: string
  filename?: string
  art?: Belegart | ReceiptType
  receiptType?: Belegart | ReceiptType
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
export type BelegRecord = ReceiptRecord

export interface CreateReceiptData {
  dateiname: string
  filename?: string
  art?: Belegart | ReceiptType
  receiptType?: Belegart | ReceiptType
  belegdatum?: string
  receiptDate?: string
  zahlungsdatum?: string
  paymentDate?: string
}
export type CreateBelegData = CreateReceiptData

/** The one assignment write: confirm a year, optionally dismissing a contradicting suggestion. */
export interface SetAssignmentData {
  steuerjahr: number
  taxYear?: number
  vorschlagVerworfen: boolean
  suggestionDismissed?: boolean
}
export type SetZuordnungData = SetAssignmentData

export const RECEIPT_REPOSITORY = Symbol('RECEIPT_REPOSITORY')
export const BELEG_REPOSITORY = RECEIPT_REPOSITORY

/** The persistence seam for Beleg / Receipt. */
export interface ReceiptRepository {
  findAllForUser(userId: string): Promise<ReceiptRecord[]>
  findByIdForUser(userId: string, id: string): Promise<ReceiptRecord | null>
  create(userId: string, data: CreateReceiptData): Promise<ReceiptRecord>
  setAssignment?(userId: string, id: string, data: SetAssignmentData): Promise<ReceiptRecord | null>
  setZuordnung(userId: string, id: string, data: SetZuordnungData): Promise<BelegRecord | null>
}
export type BelegRepository = ReceiptRepository
