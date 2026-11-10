import { EnvelopeCryptoService } from '../../src/receipt/storage/envelope-crypto.service.js'
import { InMemoryUserKeyStore } from './in-memory-user-key-store.js'
import type { PutReceiptFileInput, StoragePort, StoredReceiptMeta, StoredReceiptObject } from '../../src/receipt/storage/storage.port.js'

interface StoredEntry {
  userId: string
  receiptId: string
  mimeType: PutReceiptFileInput['mimeType']
  byteLength: number
  contentMac: string
  iv: Buffer
  authTag: Buffer
  cipherBytes: Buffer
  keyVersion: number
}

/**
 * Stateful in-memory envelope-encrypted storage fake for fast unit tests.
 * Uses real AES-256-GCM + per-user DEK wrapping so crypto-shredding tests work realistically.
 */
export class InMemoryStorageAdapter implements StoragePort {
  private readonly crypto = new EnvelopeCryptoService()
  private readonly blobs = new Map<string, StoredEntry>()

  constructor(readonly keys: InMemoryUserKeyStore = new InMemoryUserKeyStore()) {}

  private key(userId: string, receiptId: string): string {
    return `${userId}:${receiptId}`
  }

  async put(input: PutReceiptFileInput): Promise<StoredReceiptMeta> {
    const userKey =
      (await this.keys.find(input.userId)) ??
      (await this.keys.createIfAbsent(input.userId, {
        wrappedDek: this.crypto.generateWrappedDek(input.userId, 1),
        keyVersion: 1,
      }))

    const encrypted = this.crypto.encryptForUser({
      userId: input.userId,
      receiptId: input.receiptId,
      wrappedDek: userKey.wrappedDek,
      keyVersion: userKey.keyVersion,
      plainBytes: input.buffer,
    })

    this.blobs.set(this.key(input.userId, input.receiptId), {
      userId: input.userId,
      receiptId: input.receiptId,
      mimeType: input.mimeType,
      byteLength: input.buffer.length,
      contentMac: encrypted.contentMac,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      cipherBytes: encrypted.cipherBytes,
      keyVersion: userKey.keyVersion,
    })

    return {
      mimeType: input.mimeType,
      byteLength: input.buffer.length,
      contentMac: encrypted.contentMac,
    }
  }

  async get(userId: string, receiptId: string): Promise<StoredReceiptObject | null> {
    const entry = this.blobs.get(this.key(userId, receiptId))
    const userKey = await this.keys.find(userId)
    if (!entry || !userKey) return null

    const buffer = this.crypto.decryptForUser({
      userId,
      receiptId,
      wrappedDek: userKey.wrappedDek,
      keyVersion: entry.keyVersion,
      iv: entry.iv,
      authTag: entry.authTag,
      cipherBytes: entry.cipherBytes,
    })

    return {
      meta: {
        mimeType: entry.mimeType,
        byteLength: entry.byteLength,
        contentMac: entry.contentMac,
      },
      buffer,
    }
  }

  async getMeta(userId: string, receiptId: string): Promise<StoredReceiptMeta | null> {
    const entry = this.blobs.get(this.key(userId, receiptId))
    if (!entry) return null
    return { mimeType: entry.mimeType, byteLength: entry.byteLength, contentMac: entry.contentMac }
  }

  async delete(userId: string, receiptId: string): Promise<boolean> {
    return this.blobs.delete(this.key(userId, receiptId))
  }

  /** Simulates Art. 17 crypto-shredding: deletes per-user DEK while leaving raw ciphertext blobs intact. */
  async cryptoShredUser(userId: string): Promise<void> {
    await this.keys.destroy(userId)
  }

  /** Exposes raw ciphertext entry so tests can assert plaintext bytes are absent at rest. */
  rawEntryForTest(userId: string, receiptId: string): StoredEntry | null {
    return this.blobs.get(this.key(userId, receiptId)) ?? null
  }
}
