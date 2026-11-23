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

/** Which stored file has which content key: the per-user keyed HMAC of its plaintext (`contentMac`). */
export interface StoredContentKey {
  readonly receiptId: string
  readonly contentMac: string
}

/** How much one user stores: the number of files and their plaintext bytes (ADR-0106 D7 quota). */
export interface StoredReceiptUsage {
  readonly files: number
  readonly bytes: number
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
  /**
   * The content keys of all the user's files (ADR-0097 §7), to recognise the same document uploaded again.
   * The key is an HMAC of the plaintext under a key derived from the user's DEK: equal for equal content of
   * one user, unrelated across users, and gone with the DEK on crypto-shredding.
   */
  listContentKeys(userId: string): Promise<StoredContentKey[]>
  /** The user's stored files and bytes, for the per-account quota (ADR-0106 D7). */
  usage(userId: string): Promise<StoredReceiptUsage>
}
