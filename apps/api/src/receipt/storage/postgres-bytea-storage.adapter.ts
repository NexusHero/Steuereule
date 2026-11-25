import { Inject, Injectable } from '@nestjs/common'
import { USER_KEY_STORE, type UserKeyStore, type WrappedUserKey } from '../../keystore/user-key-store.js'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../../prisma/encrypted-prisma.provider.js'
import { EnvelopeCryptoService } from './envelope-crypto.service.js'
import type { AllowedReceiptMimeType } from './magic-bytes.js'
import type { PutReceiptFileInput, StoragePort, StoredContentKey, StoredReceiptMeta, StoredReceiptObject, StoredReceiptUsage } from './storage.port.js'

/**
 * Prisma types bytes as `Uint8Array<ArrayBuffer>`, which a Node Buffer is at runtime (never shared memory); the
 * cast keeps the ciphertext of up to 10 MB from being copied once more per upload.
 */
const asBytes = (buffer: Buffer): Uint8Array<ArrayBuffer> => buffer as Uint8Array<ArrayBuffer>

@Injectable()
export class PostgresByteaStorageAdapter implements StoragePort {
  constructor(
    @Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient,
    @Inject(EnvelopeCryptoService) private readonly crypto: EnvelopeCryptoService,
    @Inject(USER_KEY_STORE) private readonly keys: UserKeyStore,
  ) {}

  private async ensureUserKey(userId: string): Promise<WrappedUserKey> {
    const existing = await this.keys.find(userId)
    if (existing !== null) return existing
    const keyVersion = 1
    return this.keys.createIfAbsent(userId, { wrappedDek: this.crypto.generateWrappedDek(userId, keyVersion), keyVersion })
  }

  async put(input: PutReceiptFileInput): Promise<StoredReceiptMeta> {
    const { wrappedDek, keyVersion } = await this.ensureUserKey(input.userId)
    const encrypted = this.crypto.encryptForUser({
      userId: input.userId,
      receiptId: input.receiptId,
      wrappedDek,
      keyVersion,
      plainBytes: input.buffer,
    })

    await this.prisma.receiptFile.upsert({
      where: { receiptId: input.receiptId },
      update: {
        // The row belongs to whoever it is encrypted for (a guest's file re-stored for the account, API-20).
        userId: input.userId,
        mimeType: input.mimeType,
        byteLength: input.buffer.length,
        contentMac: encrypted.contentMac,
        iv: asBytes(encrypted.iv),
        authTag: asBytes(encrypted.authTag),
        cipherBytes: asBytes(encrypted.cipherBytes),
        keyVersion,
      },
      create: {
        receiptId: input.receiptId,
        userId: input.userId,
        mimeType: input.mimeType,
        byteLength: input.buffer.length,
        contentMac: encrypted.contentMac,
        iv: asBytes(encrypted.iv),
        authTag: asBytes(encrypted.authTag),
        cipherBytes: asBytes(encrypted.cipherBytes),
        keyVersion,
      },
    })

    return {
      mimeType: input.mimeType,
      byteLength: input.buffer.length,
      contentMac: encrypted.contentMac,
    }
  }

  async usage(userId: string): Promise<StoredReceiptUsage> {
    const total = await this.prisma.receiptFile.aggregate({ where: { userId }, _count: { _all: true }, _sum: { byteLength: true } })
    return { files: total._count._all, bytes: total._sum.byteLength ?? 0 }
  }

  async get(userId: string, receiptId: string): Promise<StoredReceiptObject | null> {
    const [fileRow, keyRow] = await Promise.all([
      this.prisma.receiptFile.findFirst({ where: { receiptId, userId } }),
      this.keys.find(userId),
    ])

    // If either row or per-user DEK is missing (e.g. crypto-shredding), payload cannot be recovered.
    if (fileRow === null || keyRow === null) {
      return null
    }

    const plainBytes = this.crypto.decryptForUser({
      userId,
      receiptId,
      wrappedDek: keyRow.wrappedDek,
      keyVersion: fileRow.keyVersion,
      iv: fileRow.iv,
      authTag: fileRow.authTag,
      cipherBytes: fileRow.cipherBytes,
    })

    return {
      meta: {
        mimeType: fileRow.mimeType as AllowedReceiptMimeType,
        byteLength: fileRow.byteLength,
        contentMac: fileRow.contentMac,
      },
      buffer: plainBytes,
    }
  }

  async getMeta(userId: string, receiptId: string): Promise<StoredReceiptMeta | null> {
    const fileRow = await this.prisma.receiptFile.findFirst({
      where: { receiptId, userId },
      select: { mimeType: true, byteLength: true, contentMac: true },
    })
    if (fileRow === null) return null
    return {
      mimeType: fileRow.mimeType as AllowedReceiptMimeType,
      byteLength: fileRow.byteLength,
      contentMac: fileRow.contentMac,
    }
  }

  async listContentKeys(userId: string): Promise<StoredContentKey[]> {
    // Two clear columns only; the ciphertext is never loaded for this.
    return this.prisma.receiptFile.findMany({ where: { userId }, select: { receiptId: true, contentMac: true } })
  }

  /**
   * Re-stores a file for another owner (guest → account, API-20): the bytes are bound to their owner by the
   * key and the AAD, so they are decrypted and encrypted again; the row then belongs to the new owner.
   */
  async move(fromUserId: string, toUserId: string, receiptId: string): Promise<void> {
    const stored = await this.get(fromUserId, receiptId)
    if (stored === null) return
    await this.put({ userId: toUserId, receiptId, buffer: stored.buffer, mimeType: stored.meta.mimeType })
  }

  async delete(userId: string, receiptId: string): Promise<boolean> {
    const res = await this.prisma.receiptFile.deleteMany({ where: { receiptId, userId } })
    return res.count > 0
  }
}
