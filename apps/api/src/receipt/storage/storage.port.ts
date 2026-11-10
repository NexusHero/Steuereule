import type { AllowedReceiptMimeType } from './magic-bytes.js'

export interface StoredReceiptMeta {
  readonly mimeType: AllowedReceiptMimeType
  readonly byteLength: number
  readonly contentMac: string
}

export interface StoredReceiptObject {
  readonly meta: StoredReceiptMeta
  readonly buffer: Buffer
}

export interface PutReceiptFileInput {
  readonly userId: string
  readonly receiptId: string
  readonly buffer: Buffer
  readonly mimeType: AllowedReceiptMimeType
}

export const STORAGE_PORT = Symbol('STORAGE_PORT')

/**
 * Abstract storage port for encrypted original receipt binaries (PDF/JPEG/PNG/WebP).
 * Keeps Step 1 (Postgres BYTEA + per-user envelope DEK) clean and #387-ready for future
 * GCS/Cloud-Storage adapters without changing controllers or services.
 */
export interface StoragePort {
  put(input: PutReceiptFileInput): Promise<StoredReceiptMeta>
  get(userId: string, receiptId: string): Promise<StoredReceiptObject | null>
  delete(userId: string, receiptId: string): Promise<boolean>
  getMeta(userId: string, receiptId: string): Promise<StoredReceiptMeta | null>
}
