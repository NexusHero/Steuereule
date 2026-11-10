import { Inject, Injectable } from '@nestjs/common'
import { ENCRYPTED_PRISMA, type EncryptedPrismaClient } from '../../prisma/encrypted-prisma.provider.js'
import { EnvelopeCryptoService } from './envelope-crypto.service.js'
import type { AllowedReceiptMimeType } from './magic-bytes.js'
import type { PutReceiptFileInput, StoragePort, StoredReceiptMeta, StoredReceiptObject } from './storage.port.js'

@Injectable()
export class PostgresByteaStorageAdapter implements StoragePort {
  constructor(
    @Inject(ENCRYPTED_PRISMA) private readonly prisma: EncryptedPrismaClient,
    @Inject(EnvelopeCryptoService) private readonly crypto: EnvelopeCryptoService,
  ) {}

  private async ensureUserKey(userId: string): Promise<{ wrappedDek: string; keyVersion: number }> {
    const existing = await this.prisma.userEncryptionKey.findUnique({ where: { userId } })
    if (existing !== null) {
      return { wrappedDek: existing.wrappedDek, keyVersion: existing.keyVersion }
    }
    const keyVersion = 1
    const wrappedDek = this.crypto.generateWrappedDek(userId, keyVersion)
    const created = await this.prisma.userEncryptionKey.upsert({
      where: { userId },
      update: {},
      create: { userId, wrappedDek, keyVersion },
    })
    return { wrappedDek: created.wrappedDek, keyVersion: created.keyVersion }
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
        mimeType: input.mimeType,
        byteLength: input.buffer.length,
        sha256: encrypted.sha256,
        iv: new Uint8Array(encrypted.iv),
        authTag: new Uint8Array(encrypted.authTag),
        cipherBytes: new Uint8Array(encrypted.cipherBytes),
        keyVersion,
      },
      create: {
        receiptId: input.receiptId,
        userId: input.userId,
        mimeType: input.mimeType,
        byteLength: input.buffer.length,
        sha256: encrypted.sha256,
        iv: new Uint8Array(encrypted.iv),
        authTag: new Uint8Array(encrypted.authTag),
        cipherBytes: new Uint8Array(encrypted.cipherBytes),
        keyVersion,
      },
    })

    return {
      mimeType: input.mimeType,
      byteLength: input.buffer.length,
      sha256: encrypted.sha256,
    }
  }

  async get(userId: string, receiptId: string): Promise<StoredReceiptObject | null> {
    const [fileRow, keyRow] = await Promise.all([
      this.prisma.receiptFile.findFirst({ where: { receiptId, userId } }),
      this.prisma.userEncryptionKey.findUnique({ where: { userId } }),
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
        sha256: fileRow.sha256,
      },
      buffer: plainBytes,
    }
  }

  async getMeta(userId: string, receiptId: string): Promise<StoredReceiptMeta | null> {
    const fileRow = await this.prisma.receiptFile.findFirst({
      where: { receiptId, userId },
      select: { mimeType: true, byteLength: true, sha256: true },
    })
    if (fileRow === null) return null
    return {
      mimeType: fileRow.mimeType as AllowedReceiptMimeType,
      byteLength: fileRow.byteLength,
      sha256: fileRow.sha256,
    }
  }

  async delete(userId: string, receiptId: string): Promise<boolean> {
    const res = await this.prisma.receiptFile.deleteMany({ where: { receiptId, userId } })
    return res.count > 0
  }
}
