import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto'
import { Inject, Injectable, Optional } from '@nestjs/common'
import { resolveFieldEncryptionKey, type FieldEncryptionKeys } from '../../prisma/field-encryption-key.js'

export const FIELD_ENCRYPTION_KEYS_PROVIDER = Symbol('FIELD_ENCRYPTION_KEYS_PROVIDER')

const DEK_LENGTH_BYTES = 32
const GCM_IV_LENGTH_BYTES = 12
const KEK_SALT = Buffer.from('steuereule-beleg-kek-v1', 'utf8')

export interface EncryptedBlob {
  readonly iv: Buffer
  readonly authTag: Buffer
  readonly cipherBytes: Buffer
  readonly sha256: string
}

/**
 * Per-user DEK + KEK envelope cryptography for uploaded original receipts (ADR-0008 / Art. 17 DSGVO).
 *
 * - Each user gets an independent random 256-bit Data Encryption Key (DEK).
 * - Each DEK is wrapped via AES-256-GCM under a user-scoped KEK derived with HKDF-SHA256
 *   from PRISMA_FIELD_ENCRYPTION_KEY (with fallback to PRISMA_FIELD_DECRYPTION_KEYS for rotation).
 * - Each receipt binary is encrypted with AES-256-GCM and authenticated with AAD `userId:receiptId`.
 * - Deleting UserEncryptionKey crypto-shreds all encrypted blobs of that user irrevocably.
 */
@Injectable()
export class EnvelopeCryptoService {
  private readonly keysProvider: () => FieldEncryptionKeys

  constructor(
    @Optional() @Inject(FIELD_ENCRYPTION_KEYS_PROVIDER) keysProvider?: () => FieldEncryptionKeys,
  ) {
    this.keysProvider = keysProvider ?? (() => resolveFieldEncryptionKey())
  }

  private deriveKek(masterKeyMaterial: string, userId: string): Buffer {
    const raw = hkdfSync(
      'sha256',
      Buffer.from(masterKeyMaterial, 'utf8'),
      KEK_SALT,
      Buffer.from(`user-dek:${userId}`, 'utf8'),
      DEK_LENGTH_BYTES,
    )
    return Buffer.from(raw)
  }

  generateWrappedDek(userId: string, keyVersion = 1): string {
    const dek = randomBytes(DEK_LENGTH_BYTES)
    const { encryptionKey } = this.keysProvider()
    const kek = this.deriveKek(encryptionKey, userId)
    try {
      const iv = randomBytes(GCM_IV_LENGTH_BYTES)
      const cipher = createCipheriv('aes-256-gcm', kek, iv)
      cipher.setAAD(Buffer.from(`dek:${userId}:${keyVersion}`, 'utf8'))
      const wrapped = Buffer.concat([cipher.update(dek), cipher.final()])
      const tag = cipher.getAuthTag()
      return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${wrapped.toString('base64')}`
    } finally {
      dek.fill(0)
      kek.fill(0)
    }
  }

  private unwrapDek(userId: string, wrappedDek: string, keyVersion: number): Buffer {
    const parts = wrappedDek.split('.')
    if (parts.length !== 4 || parts[0] !== 'v1') {
      throw new Error('Malformed wrapped DEK envelope format')
    }
    const iv = Buffer.from(parts[1]!, 'base64')
    const tag = Buffer.from(parts[2]!, 'base64')
    const ciphertext = Buffer.from(parts[3]!, 'base64')

    const { encryptionKey, decryptionKeys } = this.keysProvider()
    const candidateMasters = [encryptionKey, ...decryptionKeys]

    let lastError: unknown = null
    for (const master of candidateMasters) {
      const kek = this.deriveKek(master, userId)
      try {
        const decipher = createDecipheriv('aes-256-gcm', kek, iv)
        decipher.setAAD(Buffer.from(`dek:${userId}:${keyVersion}`, 'utf8'))
        decipher.setAuthTag(tag)
        return Buffer.concat([decipher.update(ciphertext), decipher.final()])
      } catch (err) {
        lastError = err
      } finally {
        kek.fill(0)
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Failed to unwrap user DEK')
  }

  encryptForUser(input: {
    readonly userId: string
    readonly receiptId: string
    readonly wrappedDek: string
    readonly keyVersion: number
    readonly plainBytes: Buffer
  }): EncryptedBlob {
    const dek = this.unwrapDek(input.userId, input.wrappedDek, input.keyVersion)
    try {
      const iv = randomBytes(GCM_IV_LENGTH_BYTES)
      const cipher = createCipheriv('aes-256-gcm', dek, iv)
      cipher.setAAD(Buffer.from(`${input.userId}:${input.receiptId}`, 'utf8'))
      const cipherBytes = Buffer.concat([cipher.update(input.plainBytes), cipher.final()])
      const authTag = cipher.getAuthTag()
      const sha256 = createHash('sha256').update(input.plainBytes).digest('hex')
      return { iv, authTag, cipherBytes, sha256 }
    } finally {
      dek.fill(0)
    }
  }

  decryptForUser(input: {
    readonly userId: string
    readonly receiptId: string
    readonly wrappedDek: string
    readonly keyVersion: number
    readonly iv: Buffer | Uint8Array
    readonly authTag: Buffer | Uint8Array
    readonly cipherBytes: Buffer | Uint8Array
  }): Buffer {
    const dek = this.unwrapDek(input.userId, input.wrappedDek, input.keyVersion)
    try {
      const decipher = createDecipheriv('aes-256-gcm', dek, Buffer.from(input.iv))
      decipher.setAAD(Buffer.from(`${input.userId}:${input.receiptId}`, 'utf8'))
      decipher.setAuthTag(Buffer.from(input.authTag))
      return Buffer.concat([decipher.update(Buffer.from(input.cipherBytes)), decipher.final()])
    } finally {
      dek.fill(0)
    }
  }
}
